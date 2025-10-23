import {
  Controller,
  Post,
  Body,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Model } from "mongoose";
import { lastValueFrom } from "rxjs";
import { InjectModel } from "@nestjs/mongoose";
import { ScriptService } from "src/shared/script/script.service";
import { YoutubeService } from "./video.service";
import { Job } from "src/schemas";
import { UtilityService } from "src/shared/utility/utility.service";
import { ConfigService } from "@nestjs/config";

@Controller("automate/video")
export class VideoController {
  private readonly logger = new Logger(VideoController.name);
  private readonly subtitleUrl: string;

  constructor(
    @InjectModel(Job.name) private readonly jobModel: Model<Job>,
    private readonly scriptService: ScriptService,
    // private readonly pixabayService: PixabayService,
    // private readonly musicService: MusicService,
    // private readonly thumbnailService: ThumbNailService,
    // private readonly ttsService: TTSService,
    // private readonly ffmpegService: FfmpegService,
    private readonly youtubeService: YoutubeService,
    private readonly httpService: HttpService,
    private readonly utilityService: UtilityService,
    // private readonly storageService: StorageService,
    // @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {
    this.subtitleUrl = this.configService.get<string>(
      "SUBTITLE_MICROSERVICE_URL",
      "https://yta-subtitle-microservice.onrender.com/subtitles",
    );
  }

  @Post()
  async generateVideo(@Body("prompt") prompt: string): Promise<Job> {
    if (!prompt) {
      throw new InternalServerErrorException("Prompt is required");
    }

    this.logger.log(`Starting video generation for prompt: ${prompt}`);
    const job = new this.jobModel({
      prompt,
      videoDetails: { title: "", description: "", tags: [] },
    });

    if (!job || !job._id) {
      throw new InternalServerErrorException("Job ID not generated");
    }

    try {
      const { script, title, description, tags } =
        await this.scriptService.generateScriptAndMetadata(prompt, job);
      job.script = script;
      job.videoDetails.title = title;
      job.videoDetails.description = description;
      job.videoDetails.tags = tags;

      // Step 2: Generate video using Render endpoint
      const response = await lastValueFrom(
        this.httpService.post(
          "https://mpt-mkrv.onrender.com/api/v1/videos",
          {
            video_subject: prompt,
            video_script: script,
          },
        ),
      );
      const videoUrl = response.data.data.videos[0];
      job.finalVideoUrl = videoUrl;

      // Step 3: Upload to YouTube
      const videoStream = await this.httpService.get(videoUrl, {
        responseType: "stream",
      });
      const uploadResult = await this.youtubeService.uploadVideoStream(
        videoStream.data,
        job.videoDetails.title,
        job.videoDetails.description,
        job.videoDetails.tags,
      );
      job.youtubeVideoId = uploadResult?.id;
      job.youtubeVideoUrl = uploadResult?.url;

      // Save job to MongoDB
      await job.save();

      this.logger.log(
        `Video generation completed for job: ${job._id.toString()}`,
      );
      return job;
    } catch (error) {
      this.logger.error(
        `Video generation failed for job ${job._id.toString()}: ${error.message}`,
      );
      job.errorMessage = error.message;
      await job.save();
      throw new InternalServerErrorException(
        `Video generation failed for job ${job._id.toString()}: ${error.message}`,
      );
    }
  }
}
