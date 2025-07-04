import {
  BadRequestException,
  Body,
  Controller,
  InternalServerErrorException,
  Logger,
  Post,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job, JobModel } from 'src/schemas';
import { PixabayService } from 'src/shared/pixabay/pixabay.service';
import { ScriptService } from 'src/shared/script/script.service';
import { SpeechService } from 'src/shared/speech/speech.service';
import { ThumbNailService } from 'src/shared/thumbnail/thumbnail.service';
import { TTSService } from 'src/shared/tts/tts.service';
import { JobStatus } from 'src/types/jobTypes';
import { YoutubeService } from './video.service';
import { FfmpegService } from 'src/shared/ffmpeg/ffmpeg.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('automate')
export class VideoController {
  private readonly logger = new Logger(VideoController.name);

  constructor(
    @InjectModel(Job.name) private readonly jobModel: Model<Job>,
    private scriptService: ScriptService,
    private ttsService: TTSService,
    private speechService: SpeechService,
    private thumbnailService: ThumbNailService,
    private pixabayService: PixabayService,
    private youtubeService: YoutubeService,
    private ffmpegService: FfmpegService,
  ) {}
  @Post('video')
  async createVideo(@Body() body: { prompt: string }) {
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

    // let job = await this.jobModel.findById(newJob._id);
    // if (!job) {
    //   throw new InternalServerErrorException('Job not found after creation');
    // }
    try {
      job.status = JobStatus.IN_PROGRESS;
      job.startTime = new Date();
      await job.save();

      // SCRIPT GENERATION //

      const script = await this.scriptService.generateScript(prompt);
      if (!script)
        throw new InternalServerErrorException('Script generation failed');

      job.script = script;
      await job.save();

      this.logger.log('Script generated successfully');

      // GENERATE UTILITIES
      const [tags, imageSearchQuery, description, title, videoSearchQuery] =
        await Promise.all([
          this.scriptService.generateTags(prompt),
          this.scriptService.generateImageSearchQuery(prompt),
          this.scriptService.generateVideoDescription(prompt),
          this.scriptService.generateVideoTitle(prompt),
          this.scriptService.generateVideoSearchQuery(prompt),
        ]);

      job.videoDetails = {
        title,
        description,
        tags,
        thumbnailPath: ""
      };
      job.tags = tags
      await job.save();

      // AUDIO GENERATION //

      const audioPath = await this.ttsService.synthesize(
        job.script,
        `audio_${job._id}.mp3`,
      );

      if (!audioPath)
        throw new InternalServerErrorException(
          'Text-To-Speech generation failed',
        );

      job.audioFilePath = audioPath;
      await job.save();

      this.logger.log('Audio generated successfully');

      // SUBTITLES GENERATION //
      const transcribe = await this.speechService.transcribe(
        'vosk',
        job.audioFilePath,
        job._id.toString(),
      );

      if (!transcribe)
        throw new InternalServerErrorException(
          'Speech-To-Text generation failed',
        );

      job.subtitleFilePath = transcribe;
      await job.save();

      this.logger.log('Subtitle generated successfully');

      // THUMBNAIL GENERATION //

      const thumbnailPath = await this.thumbnailService.generate(
        script,
        `thumbnail_${job?._id}.png`,
      );

      if (!thumbnailPath) {
        this.logger.log(
          'Thumbnail generation failed... implementing fallback...',
        );

        const illustrationPaths =
          await this.pixabayService.searchAndDownloadIllustrations(
            imageSearchQuery,
          );

        if (illustrationPaths.length > 0) {
          job.videoDetails.thumbnailPath = illustrationPaths[0];
          await job.save();
          this.logger.log(
            'Thanks to fallback... Thumbnail generated and downloaded successfully',
          );
        } else {
          throw new InternalServerErrorException(
            'Fallback Thumbnail generation failed',
          );
        }
      } else {
        job.videoDetails.thumbnailPath = thumbnailPath;
        await job.save();
        this.logger.log('Thumbnail generated successfully');
      }

      // BACKGROUND MUSIC GENERATION //
      this.logger.log('Fetching backgroud music...');

      const backgroundMusic = await this.pixabayService.searchAndDownloadMusic(
        tags[0],
      );
      if (backgroundMusic.length > 0) {
        job.backgroundMusicPath = backgroundMusic[0];
        await job.save();
      }

      // VIDEO GENERATION //

      this.logger.log('Searching and downloading media...');
      const videoClips: string[] = [];

      const downloadedVideoPaths =
        await this.pixabayService.searchAndDownloadVideos(videoSearchQuery, 1);

      if (downloadedVideoPaths.length > 0) {
        videoClips.push(downloadedVideoPaths[0]);
      }

      if (videoClips.length === 0) {
        throw new InternalServerErrorException(
          'Failed to download any video clips.',
        );
      }
      job.videoClips = videoClips;
      await job.save();
      this.logger.log('Media downloaded successfully.');

      // MERGE ALL MEDIA INTO FINAL VIDEO
      const finalVideoPath = path.join(
        process.cwd(),
        'uploads',
        'finals',
        `final_${job._id}.mp4`,
      );
      await fs.promises.mkdir(path.dirname(finalVideoPath), {
        recursive: true,
      });

      await this.ffmpegService.mergeAll({
        clips: job.videoClips,
        audioPath: job.audioFilePath,
        musicPath: job.backgroundMusicPath,
        subtitlePath: job.subtitleFilePath,
        thumbnailPath: job.videoDetails.thumbnailPath,
        outputPath: finalVideoPath,
      });

      job.finalVideoPath = finalVideoPath;
      await job.save();

      // authenticate to youtube
      // upload video

      const youtubeResponse = await this.youtubeService.uploadVideo(
        job.finalVideoPath,
        title,
        description,
        tags,
      );
      if (!youtubeResponse) {
        throw new Error('Failed to upload video to YouTube.');
      }
      job.youtubeVideoId = youtubeResponse.id;
      job.youtubeVideoUrl = `https://www.youtube.com/watch?v=${youtubeResponse.id}`;
      await job.save();
      this.logger.log('Video uploaded to YouTube successfully.');

      job.status = JobStatus.COMPLETED;
      job.endTime = new Date();
      this.logger.log('Final video created and saved.');
    } catch (error) {
      job.status = JobStatus.FAILED;
      await job.save();
      this.logger.log(error.message);
      this.logger.error('Job failed', error.stack);
      throw new InternalServerErrorException('Video creation failed');
    }
  }
}
