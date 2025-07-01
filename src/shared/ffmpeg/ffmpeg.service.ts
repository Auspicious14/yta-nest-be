import { Injectable } from '@nestjs/common';
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
