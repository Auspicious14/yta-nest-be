import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Model } from "mongoose";
import { lastValueFrom } from "rxjs";
import { InjectModel } from "@nestjs/mongoose";
import { ScriptService } from "src/shared/script/script.service";
import { YoutubeService } from "./video.service";
import { Job, JobDocument } from "src/schemas";
import { JobStatus } from "src/types/jobTypes";
import { UtilityService } from "src/shared/utility/utility.service";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

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
    // this.subtitleUrl = this.configService.get<string>(
    //   "SUBTITLE_MICROSERVICE_URL",
    //   "https://yta-subtitle-microservice.onrender.com/subtitles",
    // );
  }

  @Post()
  async generateVideo(@Body("prompt") prompt: string): Promise<Job> {
    if (!prompt) {
      throw new InternalServerErrorException("Prompt is required");
    }

    this.logger.log(`Starting video generation for prompt: ${prompt}`);

    // Create job immediately
    const job = new this.jobModel({
      prompt,
      status: JobStatus.PENDING,
      videoDetails: { title: "", description: "", tags: [] },
      startTime: new Date(),
    });

    await job.save();

    if (!job || !job._id) {
      throw new InternalServerErrorException("Job ID not generated");
    }

    // Process video generation asynchronously
    this.processVideoGeneration(job).catch((error) => {
      this.logger.error(
        `Background video generation failed for job ${(job._id as any).toString()}: ${error.message}`,
      );
    });

    // Return job immediately
    return job;
  }

  @Get(":id")
  async getJobStatus(@Param("id") id: string): Promise<Job> {
    this.logger.log(`Fetching job status for ID: ${id}`);

    const job = await this.jobModel.findById(id).exec();

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    return job;
  }

  @Get()
  async listJobs(): Promise<Job[]> {
    this.logger.log("Fetching all jobs");

    const jobs = await this.jobModel
      .find()
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();

    return jobs;
  }

  /**
   * Call MPT service with retry logic for Render free tier wake-up
   * Returns the task_id for polling
   */
  private async callMPTServiceWithRetry(
    prompt: string,
    script: string,
    jobId: string,
    maxRetries = 5,
  ): Promise<string> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(
          `MPT service attempt ${attempt}/${maxRetries} for job: ${jobId}`,
        );

        const response = await lastValueFrom(
          this.httpService.post(
            "https://mpt-mkrv.onrender.com/api/v1/videos",
            {
              video_subject: prompt,
              video_script: script,
              video_aspect: "9:16",
              video_concat_mode: "random",
              video_transition_mode: "None",
              video_clip_duration: 5,
              video_count: 1,
              video_source: "pixabay",
              video_materials: [
                {
                  provider: "pixabay",
                  url: "",
                  duration: 0,
                },
              ],
              video_language: "english",
              voice_name: "",
              voice_volume: 1,
              voice_rate: 1,
              bgm_type: "random",
              bgm_file: "",
              bgm_volume: 0.2,
              subtitle_enabled: true,
              subtitle_position: "bottom",
              custom_position: 70,
              font_name: "STHeitiMedium.ttc",
              text_fore_color: "#FFFFFF",
              text_background_color: true,
              font_size: 60,
              stroke_color: "#000000",
              stroke_width: 1.5,
              n_threads: 2,
              paragraph_number: 1,
            },
            {
              timeout: 300000,
              validateStatus: (status) => status < 500,
            },
          ),
        );

        if (response.status === 403) {
          this.logger.warn(
            `MPT service returned 403 (attempt ${attempt}/${maxRetries})`,
          );

          if (attempt < maxRetries) {
            const delay = Math.min(10000 * Math.pow(2, attempt - 1), 60000);
            this.logger.log(`Waiting ${delay / 1000}s before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          throw new Error("MPT service returned 403 Forbidden");
        }

        if (!response.data?.data?.task_id) {
          throw new Error(
            `No task_id in response. Status: ${response.status}, Data: ${JSON.stringify(response.data)}`,
          );
        }

        const taskId = response.data.data.task_id;
        this.logger.log(`MPT service returned task_id: ${taskId}`);
        return taskId;
      } catch (error) {
        lastError = error;
        this.logger.error(
          `MPT service attempt ${attempt}/${maxRetries} failed: ${error.message}`,
        );

        if (attempt < maxRetries) {
          const delay = Math.min(5000 * Math.pow(2, attempt - 1), 60000);
          this.logger.log(`Retrying in ${delay / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `MPT service failed after ${maxRetries} attempts. Last error: ${lastError.message}`,
    );
  }

  /**
   * Poll MPT service for task completion
   * Checks task status until video is ready (state === 1 and progress === 100)
   */
  private async pollTaskStatus(
    taskId: string,
    jobId: string,
    maxAttempts = 60,
    pollInterval = 10000,
  ): Promise<string> {
    this.logger.log(`Starting to poll task ${taskId} for job: ${jobId}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await lastValueFrom(
          this.httpService.get(
            `https://mpt-mkrv.onrender.com/api/v1/tasks/${taskId}`,
            {
              timeout: 30000,
              validateStatus: (status) => status < 500,
            },
          ),
        );

        if (response.status === 404) {
          this.logger.warn(
            `Task ${taskId} not found (attempt ${attempt}/${maxAttempts})`,
          );

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
            continue;
          }

          throw new Error(
            `Task ${taskId} not found after ${maxAttempts} attempts`,
          );
        }

        if (response.status !== 200 || !response.data?.data) {
          throw new Error(
            `Invalid response from task status endpoint. Status: ${response.status}`,
          );
        }

        const task = response.data.data;

        this.logger.log(
          `Task ${taskId} status: state=${task.state}, progress=${task.progress}%`,
        );

        if (task.state === 1 && task.progress === 100) {
          const videoUrl = task.combined_videos?.[0] || task.videos?.[0];

          if (!videoUrl) {
            throw new Error(
              `Task completed but no video URL found in response`,
            );
          }

          this.logger.log(
            `Task ${taskId} completed successfully. Video URL: ${videoUrl}`,
          );

          return videoUrl;
        }

        if (task.state < 0) {
          throw new Error(`Task ${taskId} failed with state: ${task.state}`);
        }

        if (attempt < maxAttempts) {
          this.logger.log(
            `Task ${taskId} still processing (${task.progress}%). Waiting ${pollInterval / 1000}s before next check...`,
          );
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }
      } catch (error) {
        this.logger.error(
          `Error polling task ${taskId} (attempt ${attempt}/${maxAttempts}): ${error.message}`,
        );

        if (error.message.includes("Task completed but no video URL")) {
          throw error;
        }

        if (attempt >= maxAttempts) {
          throw new Error(
            `Failed to get task status after ${maxAttempts} attempts: ${error.message}`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(
      `Task ${taskId} did not complete within the expected time (${(maxAttempts * pollInterval) / 60000} minutes)`,
    );
  }

  private async processVideoGeneration(job: JobDocument): Promise<void> {
    try {
      job.status = JobStatus.PROCESSING;
      await job.save();

      this.logger.log(
        `Generating script for job: ${(job._id as any).toString()}`,
      );
      const { script, title, description, tags } =
        await this.scriptService.generateScriptAndMetadata(job.prompt, job);

      job.script = script;
      job.videoDetails.title = title;
      job.videoDetails.description = description;
      job.videoDetails.tags = tags;
      await job.save();

      this.logger.log(
        `Requesting video generation from MPT service for job: ${(job._id as any).toString()}`,
      );

      const taskId = await this.callMPTServiceWithRetry(
        job.prompt,
        script,
        job._id as any,
      );

      this.logger.log(
        `Task created with ID: ${taskId} for job: ${(job._id as any).toString()}`,
      );

      this.logger.log(`Polling task ${taskId} for completion...`);

      const videoUrl = await this.pollTaskStatus(
        taskId,
        (job._id as any).toString(),
      );

      job.finalVideoUrl = videoUrl;
      await job.save();

      this.logger.log(
        `Video generated successfully for job: ${(job._id as any).toString()}`,
      );

      this.logger.log(
        `Uploading video to YouTube for job: ${(job._id as any).toString()}`,
      );

      const videoStream = await axios.get(videoUrl, {
        responseType: "stream",
        timeout: 60000,
      });

      const uploadResult = await this.youtubeService.uploadVideoStream(
        videoStream.data,
        job.videoDetails.title,
        job.videoDetails.description,
        job.videoDetails.tags,
      );

      if (uploadResult) {
        job.youtubeVideoId = uploadResult.id;
        job.youtubeVideoUrl = uploadResult.url;
        job.status = JobStatus.COMPLETED;
        this.logger.log(
          `Video uploaded to YouTube successfully for job: ${(job._id as any).toString()}`,
        );
      } else {
        throw new Error("YouTube upload failed - no result returned");
      }

      job.endTime = new Date();
      await job.save();

      this.logger.log(
        `Video generation completed for job: ${(job._id as any).toString()}`,
      );
    } catch (error) {
      this.logger.error(
        `Video generation failed for job ${(job._id as any).toString()}: ${error.message}`,
      );
      job.status = JobStatus.FAILED;
      job.errorMessage = error.message;
      job.endTime = new Date();
      await job.save();
    }
  }
}
