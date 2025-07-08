import {
  BadRequestException,
  Body,
  Controller,
  InternalServerErrorException,
  Logger,
  Post,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, GridFSBucket } from 'mongoose';
import { Job, JobDocument } from 'src/schemas';
import { PixabayService } from 'src/shared/pixabay/pixabay.service';
import { ScriptService } from 'src/shared/script/script.service';
import { SpeechService } from 'src/shared/speech/speech.service';
import { Thumbdeclare @Body() body: { prompt: string }) {
    const prompt = body.prompt;
    this.logger.log('Start Prompting...');

    if (!prompt || typeof prompt !== 'string' || prompt.length < 5) {
      throw new BadRequestException('Prompt is invalid');
    }

    const job = new this.jobModel({
      prompt,
      status: JobStatus.PENDING,
    });
    await job.save();

    try {
      job.status = JobStatus.IN_PROGRESS;
      job.startTime = new Date();
      await job.save();

      // Parallelize script and metadata generation
      this.logger.log('Generating script and metadata...');
      console.time('script-and-metadata');
      const [script, tags, imageSearchQuery, description, title, videoSearchQuery] = await Promise.all([
        this.retryOperation(() => this.scriptService.generateScript(prompt), 'Script generation'),
        this.retryOperation(() => this.scriptService.generateTags(prompt), 'Tags generation'),
        this.retryOperation(() => this.scriptService.generateImageSearchQuery(prompt), 'Image search query'),
        this.retryOperation(() => this.scriptService.generateVideoDescription(prompt), 'Video description'),
        this.retryOperation(() => this.scriptService.generateVideoTitle(prompt), 'Video title'),
        this.retryOperation(() => this.scriptService.generateVideoSearchQuery(prompt), 'Video search query'),
      ]);
      console.timeEnd('script-and-metadata');

      if (!script) throw new InternalServerErrorException('Script generation failed');

      job.script = script;
      job.videoDetails = { title, description, tags, thumbnailId: null };
      job.tags = tags;
      await job.save();
      this.logger.log('Script and metadata generated successfully');

      // Parallelize audio, videos, thumbnails, and music
      this.logger.log('Generating audio, videos, thumbnails, and music...');
      console.time('media-generation');
      const [audioStream, videoStreams, thumbnailStream, backgroundMusicStream] = await Promise.all([
        this.retryOperation(
          () => this.ttsService.synthesizeStream(job.script),
          'Text-to-Speech'
        ),
        this.retryOperation(
          () => this.pixabayService.searchAndDownloadVideoStreams(videoSearchQuery, 1),
          'Video download'
        ).then(videos => videos.length > 0 ? videos : Promise.reject('No video clips downloaded')),
        this.generateThumbnailWithFallback(script, imageSearchQuery, job._id.toString()),
        this.retryOperation(
          () => this.pixabayService.searchAndDownloadMusicStream(tags[0]),
          'Music download'
        ).then(music => music || null),
      ]);
      console.timeEnd('media-generation');

      if (!audioStream) throw new InternalServerErrorException('Text-to-Speech generation failed');

      // Store streams in GridFS
      const bucket = new GridFSBucket(this.jobModel.db);
      const audioId = await this.storeStream(bucket, audioStream, `audio_${job._id}.mp3`);
      job.audioId = audioId;

      if (videoStreams.length === 0) throw new InternalServerErrorException('Failed to download any video clips');
      const videoClipIds = await Promise.all(
        videoStreams.map((stream, index) => this.storeStream(bucket, stream, `video_${job._id}_${index}.mp4`))
      );
      job.videoClipIds = videoClipIds;

      const thumbnailId = await this.storeStream(bucket, thumbnailStream, `thumbnail_${job._id}.png`);
      job.videoDetails.thumbnailId = thumbnailId;

      if (backgroundMusicStream) {
        job.backgroundMusicId = await this.storeStream(bucket, backgroundMusicStream, `music_${job._id}.mp3`);
      }

      await job.save();
      this.logger.log('Media assets stored successfully');

      // Subtitle generation via FastAPI
      this.logger.log('Generating subtitles via FastAPI...');
      console.time('subtitles');
      const audioBuffer = await this.streamToBuffer(audioStream); // Convert stream to buffer for FastAPI
      const subtitleResponse = await this.retryOperation(
        async () => {
          const response = await firstValueFrom(
            this.httpService.post('http://localhost:8000/subtitles', { audio: audioBuffer.toString('base64') })
          );
          return response.data.subtitles ? this.saveSubtitles(response.data.subtitles, job._id.toString(), bucket) : null;
        },
        'Subtitle generation'
      );
      console.timeEnd('subtitles');

      if (!subtitleResponse) throw new InternalServerErrorException('Subtitle generation failed');
      job.subtitleId = subtitleResponse;
      await job.save();
      this.logger.log('Subtitles stored successfully');

      // Merge media into final video
      this.logger.log('Merging media into final video...');
      console.time('video-merge');
      const finalVideoStream = await this.ffmpegService.mergeAll({
        clipStreams: videoStreams,
        audioStream,
        musicStream: backgroundMusicStream,
        subtitleId: job.subtitleId,
        thumbnailId: job.videoDetails.thumbnailId,
        bucket,
      });
      const finalVideoId = await this.storeStream(bucket, finalVideoStream, `final_${job._id}.mp4`);
      console.timeEnd('video-merge');

      job.finalVideoId = finalVideoId;
      await job.save();
      this.logger.log('Final video stored successfully');

      // Upload to YouTube
      this.logger.log('Uploading to YouTube...');
      console.time('youtube-upload');
      const youtubeResponse = await this.retryOperation(
        () => this.youtubeService.uploadVideoStream(finalVideoStream, title, description, tags),
        'YouTube upload'
      );
      console.timeEnd('youtube-upload');

      if (!youtubeResponse) throw new InternalServerErrorException('Failed to upload video to YouTube');
      job.youtubeVideoId = youtubeResponse.id;
      job.youtubeVideoUrl = `https://www.youtube.com/watch?v=${youtubeResponse.id}`;
      job.status = JobStatus.COMPLETED;
      job.endTime = new Date();
      await job.save();
      this.logger.log('Video uploaded to YouTube successfully');

      return { jobId: job._id, videoUrl: job.youtubeVideoUrl };
    } catch (error) {
      job.status = JobStatus.FAILED;
      await job.save();
      this.logger.error(`Job failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Video creation failed: ${error.message}`);
    }
  }

  // Retry wrapper for API calls
  private async retryOperation<T>(operation: () => Promise<T>, operationName: string, retries = this.maxRetries): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        const result = await operation();
        if (result) return result;
        throw new Error(`${operationName} returned empty result`);
      } catch (error) {
        this.logger.warn(`${operationName} retry ${i + 1}/${retries}: ${error.message}`);
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  // Handle thumbnail generation with fallback 
  private async generateThumbnailWithFallback(script: string, imageSearchQuery: string, jobId: string): Promise<Readable> {
    try {
      const thumbnailStream = await this.thumbnailService.generateStream(script);
      if (thumbnailStream) return thumbnailStream;
      this.logger.log('Thumbnail generation failed, using Pixabay fallback...');
      const illustrationStreams = await this.pixabayService.searchAndDownloadIllustrationStreams(imageSearchQuery);
      return illustrationStreams.length > 0 ? illustrationStreams[0] : null;
    } catch (error) {
      this.logger.error(`Thumbnail generation error: ${error.message}`);
      throw new InternalServerErrorException('Thumbnail generation failed');
    }
  }

  // Save subtitles to GridFS as SRT
  private async saveSubtitles(subtitles: string[], jobId: string, bucket: GridFSBucket): Promise<string> {
    const srtContent = subtitles
      .map((text, index) => {
        const start = index * 2; // Simplified timing
        const end = start + 2;
        return `${index + 1}\n${this.formatTime(start)} --> ${this.formatTime(end)}\n${text}\n\n`;
      })
      .join('');
    const srtStream = Readable.from(srtContent);
    return this.storeStream(bucket, srtStream, `subtitles_${jobId}.srt`);
  }

  // Store stream in GridFS
  private async storeStream(bucket: GridFSBucket, stream: Readable, filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(filename);
      stream.pipe(uploadStream)
        .on('error', reject)
        .on('finish', () => resolve(uploadStream.id.toString()));
    });
  }

  // Convert stream to buffer for FastAPI
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  // Format time for SRT (HH:MM:SS,mmm)
  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    const milliseconds = 0; // Simplified
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }
}
