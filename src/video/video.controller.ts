import {
  BadRequestException,
  Body,
  Controller,
  InternalServerErrorException,
  Post,
} from '@nestjs/common';
import { Job, JobModel, JobSchema } from 'src/schemas';
import { PixabayService } from 'src/shared/pixabay/pixabay.service';
import { ScriptService } from 'src/shared/script/script.service';
import { SpeechService } from 'src/shared/speech/speech.service';
import { ThumbNailService } from 'src/shared/thumbnail/thumbnail.service';
import { TTSService } from 'src/shared/tts/tts.service';
import { JobStatus } from 'src/types/jobTypes';
import { VideoService } from './video.service';

@Controller('automate')
export class VideoController {
  constructor(
    private scriptService: ScriptService,
    private ttsService: TTSService,
    private speechService: SpeechService,
    private thumbnailService: ThumbNailService,
    private pixabayService: PixabayService,
    private videoService: VideoService,
  ) {}
  @Post('video')
  async createVideo(@Body() prompt: string) {
    console.log('Start Prompting...');

    if (!prompt) throw new BadRequestException('Prompt not found');

    const newJob: any = new JobModel({
      prompt,
      status: JobStatus.PENDING,
    });

    await newJob.save();

    let job: any = await JobModel.findById(newJob._id);

    job.status = JobStatus.IN_PROGRESS;
    job.startTime = new Date();
    await job.save();

    // SCRIPT GENERATION //

    const script = await this.scriptService.generateScript(prompt);
    if (!script)
      throw new InternalServerErrorException('Script generation failed');

    job.script = script;
    await job.save();

    console.log('Script generated successfully');

    // GENERATE UTILITIES
    const tags = await this.scriptService.generateTags(
      script.substring(0, 100),
    );
    const imageSearchQuery = await this.scriptService.generateImageSearchQuery(
      script.substring(0, 100),
    );
    const description = await this.scriptService.generateVideoDescription(
      script.substring(0, 100),
    );
    const title = await this.scriptService.generateVideoTitle(
      script.substring(0, 100),
    );
    const videoSearchQuery = await this.scriptService.generateVideoSearchQuery(
      script.substring(0, 100),
    );

    job.videoDetails = {
      title,
      description,
      tags,
      thumbnailPath: job.videoDetails.thumbnailPath,
    };
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

    console.log('Audio generated successfully');

    // SUBTITLES GENERATION //
    const transcribe = await this.speechService.transcribe(
      'vosk',
      job.audioFilePath,
    );

    if (!transcribe)
      throw new InternalServerErrorException(
        'Speech-To-Text generation failed',
      );

    job.subtitleFilePath = transcribe;
    await job.save();

    console.log('Subtitle generated successfully');

    // THUMBNAIL GENERATION //

    const thumbnailPath = await this.thumbnailService.generate(
      script,
      `thumbnail_${job?._id}.png`,
    );

    if (!thumbnailPath) {
      console.log('Thumbnail generation failed... implementing fallback...');

      const illustrationPaths =
        await this.pixabayService.searchAndDownloadIllustrations(
          imageSearchQuery,
        );

      if (illustrationPaths.length > 0) {
        job.videoDetails.thumbnailPath = illustrationPaths[0];
        await job.save();
        console.log(
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
      console.log('Thumbnail generated successfully');
    }

    // BACKGROUND MUSIC GENERATION //
    console.info('Fetching backgroud music...');

    const backgroundMusic = await this.pixabayService.searchAndDownloadMusic(
      tags[0],
    );
    if (backgroundMusic.length > 0) {
      job.backgroundMusic = backgroundMusic[0];
      await job.save();
    }

    // VIDEO GENERATION //

    console.info('Searching and downloading media...');
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
    console.info('Media downloaded successfully.');
  }
}
