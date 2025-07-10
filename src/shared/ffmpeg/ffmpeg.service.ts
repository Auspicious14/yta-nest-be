import { Injectable, Logger } from '@nestjs/common';
import * as ffmpeg from 'fluent-ffmpeg';
import { Readable, PassThrough } from 'stream';
import * as path from 'path';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { GridFSBucket } from 'mongodb';
import { VideoMergeOptions } from 'src/types/videoMerge';

@Injectable()
export class FffmpegService {
  private readonly logger = new Logger(FffmpegService.name);

  async mergeAll(options: VideoMergeOptions): Promise<Readable> {
    const { clipStreams, audioStream, musicStream, subtitleId, thumbnailId, bucket } = options;

    this.logger.log('Starting FFmpeg video merge process...');

    try {
      const tempConcatPath = path.resolve('tmp', `concat-${uuidv4()}.mp4`);
      await fs.mkdir(path.dirname(tempConcatPath), { recursive: true });

      const concatStream = await this.concatenateClips(clipStreams, tempConcatPath);

      const outputStream = await this.mergeWithAudioAndMetadata(
        concatStream,
        audioStream,
        musicStream,
        subtitleId,
        thumbnailId,
        bucket,
      );

      await fs.unlink(tempConcatPath).catch(err => this.logger.warn(`Failed to delete temp file ${tempConcatPath}: ${err.message}`));

      this.logger.log('FFmpeg video merge completed successfully');
      return outputStream;
    } catch (error: any) {
      this.logger.error(`FFmpeg merge failed: ${error.message}`);
      throw new Error(`Failed to merge video: ${error.message}`);
    }
  }

  private async concatenateClips(clipStreams: Readable[], outputPath: string): Promise<Readable> {
    this.logger.log(`Concatenating ${clipStreams.length} video clips...`);

    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      clipStreams.forEach((stream) => {
        command.input(stream).inputFormat('mp4');
      });

      const filter = clipStreams.map((_, i) => [`[${i}:v][${i}:a]`]).join('');
      const outputStream = new PassThrough();
      outputStream['filename'] = path.basename(outputPath);

      command
        .complexFilter(`[${filter}]concat=n=${clipStreams.length}:v=1:a=1[outv][outa]`)
        .outputOptions(['-map', '[outv]', '-map', '[outa]', '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'ultrafast'])
        .pipe(outputStream, { end: true })
        .on('end', async () => {
          this.logger.log('Video clips concatenated successfully');
          // Write to temp file for compatibility, then create a Readable stream
          await fs.writeFile(outputPath, await this.streamToBuffer(outputStream));
          const fileStream = fs.createReadStream(outputPath);
          fileStream['filename'] = path.basename(outputPath);
          resolve(fileStream);
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
    bucket: GridFSBucket,
  ): Promise<Readable> {
    this.logger.log('Merging audio, subtitles, and thumbnail...');

    let tempSubtitlePath: string | null = null;
    if (subtitleId) {
      tempSubtitlePath = path.resolve('tmp', `subtitles-${uuidv4()}.srt`);
      await this.writeGridFSToFile(bucket, subtitleId, tempSubtitlePath);
    }

    let tempThumbnailPath: string | null = null;
    if (thumbnailId) {
      tempThumbnailPath = path.resolve('tmp', `thumbnail-${uuidv4()}.png`);
      await this.writeGridFSToFile(bucket, thumbnailId, tempThumbnailPath);
    }

    return new Promise((resolve, reject) => {
      const outputStream = new PassThrough();
      outputStream['filename'] = `final_${uuidv4()}.mp4`;

      let command = ffmpeg()
        .input(videoStream)
        .inputFormat('mp4')
        .input(audioStream)
        .inputFormat('wav');

      if (musicStream) {
        command = command.input(musicStream).inputFormat('mp3');
      }

      const filters: string[] = [];
      let outputMap = ['-map', '0:v'];

      if (musicStream) {
        filters.push('[1:a]volume=1.0[mainAudio]', '[2:a]volume=0.2[bgMusic]', '[mainAudio][bgMusic]amix=inputs=2:duration=first:dropout_transition=2[aout]');
        outputMap.push('-map', '[aout]');
      } else {
        outputMap.push('-map', '1:a');
      }

      if (tempSubtitlePath) {
        filters.push(`subtitles=${tempSubtitlePath}:force_style='FontSize=24,PrimaryColour=&Hffffff&,OutlineColour=&H000000&,BorderStyle=3'`);
      }

      if (tempThumbnailPath) {
        filters.push(`movie=${tempThumbnailPath}[logo];[0:v][logo]overlay=W-w-10:10:enable='lte(t,5)'[vout]);
        outputMap[0] = '-map';
        outputMap[1] = '[vout]'`;
      }

      if (filters.length > 0) {
        command.complexFilter(filters);
      }

      command
        .outputOptions([
          ...outputMap,
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'ultrafast',
          '-r', '30',
          '-s', '1280x720',
          '-shortest',
          '-f', 'mp4',
        ])
        .pipe(outputStream, { end: true })
        .on('end', async () => {
          this.logger.log('Final video merge completed');
          if (tempSubtitlePath) await fs.unlink(tempSubtitlePath).catch(err => this.logger.warn(`Failed to delete ${tempSubtitlePath}: ${err.message})`);
          if (tempThumbnailPath) await fs.unlink(tempThumbnailPath).catch(err => this.logger.warn(`Failed to delete ${tempThumbnailPath}: ${err.message})`);
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
      const downloadStream = bucket.openDownloadStream(fileId);
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

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream
        .on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject);
    });
  }
}
