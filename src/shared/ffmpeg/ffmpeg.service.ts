/*import { Injectable } from '@nestjs/common';
import * as ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { VideoMergeOptions } from 'src/types/videoMerge';

@Injectable()
export class FfmpegService {
  async mergeAll(options: VideoMergeOptions): Promise<void> {
    const {
      clips,
      audioPath,
      musicPath,
      subtitlePath,
      thumbnailPath,
      outputPath,
    } = options;

    // Step 1: Concatenate clips
    const concatListPath = path.resolve('tmp', `concat-${Date.now()}.txt`);
    const concatContent = clips
      .map((c) => `file '${path.resolve(c)}'`)
      .join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    const tempMergedPath = path.resolve('tmp', `merged-${Date.now()}.mp4`);

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions('-c', 'copy')
        .output(tempMergedPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // Step 2: Overlay audio + bg music + subtitles + thumbnail (final step)
    return new Promise((resolve, reject) => {
      let cmd = ffmpeg(tempMergedPath).audioCodec('aac');

      if (audioPath) {
        cmd = cmd.input(audioPath);
      }

      if (musicPath) {
        cmd = cmd
          .input(musicPath)
          .complexFilter([
            '[1:a]volume=0.2[a1]',
            '[0:a][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]',
          ])
          .outputOptions('-map', '0:v', '-map', '[aout]');
      }

      if (subtitlePath) {
        cmd = cmd.outputOptions(`-vf subtitles=${subtitlePath}`);
      }

      if (thumbnailPath) {
        cmd = cmd.outputOptions(
          '-vf',
          `movie=${thumbnailPath} [logo]; [in][logo] overlay=W-w-10:10 [out]`,
        );
      }

      cmd
        .output(outputPath)
        .on('end', () => {
          fs.unlinkSync(concatListPath);
          fs.unlinkSync(tempMergedPath);
          resolve();
        })
        .on('error', reject)
        .run();
    });
  }
}
*/


import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import { Readable } from 'stream';
import { VideoMergeOptions } from 'src/types/videoMerge';
import * as path from 'path';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FffmpegService {
  private readonly logger = new Logger(FffmpegService.name);

  async mergeAll(options: VideoMergeOptions): Promise<Readable> {
    const { clipStreams, audioStream, musicStream, subtitleId, thumbnailId, bucket } = options;

    this.logger.log('Starting FFmpeg video merge process...');

    try {
      // Step 1: Concatenate video clips using stream-based concat
      const tempConcatPath = path.resolve('tmp', `concat-${uuidv4()}.mp4`);
      await fs.mkdir(path.dirname(tempConcatPath), { recursive: true });

      const concatStream = await this.concatenateClips(clipStreams, tempConcatPath);

      // Step 2: Merge audio, music, subtitles, and thumbnail
      const outputStream = await this.mergeWithAudioAndMetadata(
        concatStream,
        audioStream,
        musicStream,
        subtitleId,
        thumbnailId,
        bucket
      );

      // Clean up temporary concat file
      await fs.unlink(tempConcatPath).catch(err => this.logger.warn(`Failed to delete temp file ${tempConcatPath}: ${err.message}`));

      this.logger.log('FFmpeg video merge completed successfully');
      return outputStream;
    } catch (error) {
      this.logger.error(`FFmpeg merge failed: ${error.message}`);
      throw new Error(`Failed to merge video: ${error.message}`);
    }
  }

  private async concatenateClips(clipStreams: Readable[], outputPath: string): Promise<Readable> {
    this.logger.log(`Concatenating ${clipStreams.length} video clips...`);

    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      // Add each clip stream as an input
      clipStreams.forEach((stream, index) => {
        command.input(stream).inputFormat('mp4');
      });

      // Use concat filter for stream-based concatenation
      const filter = clipStreams.map((_, i) => `[${i}:v][${i}:a]`).join('');
      command
        .complexFilter(`${filter}concat=n=${clipStreams.length}:v=1:a=1[v][a]`)
        .outputOptions(['-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'ultrafast'])
        .output(outputPath)
        .on('end', () => {
          this.logger.log('Video clips concatenated successfully');
          const outputStream = new Readable().wrap(fs.createReadStream(outputPath));
          outputStream['filename'] = path.basename(outputPath);
          resolve(outputStream);
        })
        .on('error', (err) => {
          this.logger.error(`Clip concatenation failed: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }

  private async mergeWithAudioAndMetadata(
    videoStream: Readable,
    audioStream: Readable,
    musicStream: Readable | null,
    subtitleId: string,
    thumbnailId: string,
    bucket: GridFSBucket
  ): Promise<Readable> {
    this.logger.log('Merging audio, subtitles, and thumbnail...');

    // Temporary file for subtitles (FFmpeg requires file for subtitles filter)
    let tempSubtitlePath: string | null = null;
    if (subtitleId) {
      tempSubtitlePath = path.resolve('tmp', `subtitles-${uuidv4()}.srt`);
      await this.writeGridFSToFile(bucket, subtitleId, tempSubtitlePath);
    }

    // Temporary file for thumbnail (FFmpeg requires file for movie filter)
    let tempThumbnailPath: string | null = null;
    if (thumbnailId) {
      tempThumbnailPath = path.resolve('tmp', `thumbnail-${uuidv4()}.png`);
      await this.writeGridFSToFile(bucket, thumbnailId, tempThumbnailPath);
    }

    return new Promise((resolve, reject) => {
      const outputStream = new Readable({ read() {} });
      outputStream['filename'] = `final_${uuidv4()}.mp4`;

      let command = ffmpeg()
        .input(videoStream)
        .inputFormat('mp4')
        .input(audioStream)
        .inputFormat('wav');

      // Add music stream if provided
      if (musicStream) {
        command = command.input(musicStream).inputFormat('mp3');
      }

      // Build complex filter
      const filters: string[] = [];
      let outputMap = ['-map', '0:v']; // Map video from first input

      // Audio mixing
      if (musicStream) {
        filters.push('[1:a]volume=1.0[mainAudio]', '[2:a]volume=0.2[bgMusic]', '[mainAudio][bgMusic]amix=inputs=2:duration=first:dropout_transition=2[aout]');
        outputMap.push('-map', '[aout]');
      } else {
        outputMap.push('-map', '1:a');
      }

      // Subtitles
      if (tempSubtitlePath) {
        filters.push(`subtitles=${tempSubtitlePath}:force_style='FontSize=24,PrimaryColour=&Hffffff&,OutlineColour=&H000000&,BorderStyle=3'`);
      }

      // Thumbnail overlay
      if (tempThumbnailPath) {
        filters.push(`movie=${tempThumbnailPath}[logo];[0:v][logo]overlay=W-w-10:10:enable='lte(t,5)'[vout]`);
        outputMap[0] = '-map';
        outputMap[1] = '[vout]';
      }

      // Apply filters and output options
      if (filters.length > 0) {
        command.complexFilter(filters);
      }

      command
        .outputOptions([
          ...outputMap,
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'ultrafast',
          '-r', '30', // Ensure 30fps for smooth playback
          '-s', '1280x720', // Ensure 720p resolution
          '-shortest', // Match shortest input duration
          '-f', 'mp4',
        ])
        .pipe(outputStream, { end: true })
        .on('end', async () => {
          this.logger.log('Final video merge completed');
          // Clean up temporary files
          if (tempSubtitlePath) await fs.unlink(tempSubtitlePath).catch(err => this.logger.warn(`Failed to delete ${tempSubtitlePath}: ${err.message}`));
          if (tempThumbnailPath) await fs.unlink(tempThumbnailPath).catch(err => this.logger.warn(`Failed to delete ${tempThumbnailPath}: ${err.message}`));
          resolve(outputStream);
        })
        .on('error', (err) => {
          this.logger.error(`Final merge failed: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }

  private async writeGridFSToFile(bucket: GridFSBucket, fileId: string, outputPath: string): Promise<void> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    return new Promise((resolve, reject) => {
      const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
      const fileWriteStream = fs.createWriteStream(outputPath);
      downloadStream
        .pipe(fileWriteStream)
        .on('finish', () => {
          this.logger.log(`Wrote GridFS file ${fileId} to ${outputPath}`);
          resolve();
        })
        .on('error', (err) => {
          this.logger.error(`Failed to write GridFS file ${fileId}: ${err.message}`);
          reject(err);
        });
    });
  }
}
