import {
  Controller,
  Post,
  Body,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import GridFSBucket, { Connection, Types } from "mongoose";
import { Readable } from "stream";
import { lastValueFrom } from "rxjs";
import { InjectConnection } from "@nestjs/mongoose";
import { FffmpegService } from "src/shared/ffmpeg/ffmpeg.service";
import { PixabayService } from "src/shared/pixabay/pixabay.service";
import { ScriptService } from "src/shared/script/script.service";
import { ThumbNailService } from "src/shared/thumbnail/thumbnail.service";
import { TTSService } from "src/shared/tts/tts.service";
import { YoutubeService } from "./video.service";
import { Job } from "src/types/jobTypes";

@Controller("video")
export class VideoController {
  private readonly logger = new Logger(VideoController.name);

  constructor(
    private readonly scriptService: ScriptService,
    private readonly pixabayService: PixabayService,
    private readonly thumbnailService: ThumbNailService,
    private readonly ttsService: TTSService,
    private readonly ffmpegService: FffmpegService,
    private readonly youtubeService: YoutubeService,
    private readonly httpService: HttpService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries = 5,
    baseDelay = 1000,
    // Return undefined to satisfy TypeScript return type check
  ): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        this.logger.warn(
          `Operation ${operationName} failed (attempt ${attempt}/${maxRetries}): ${error.message}`,
        );
        if (attempt === maxRetries) {
          throw new InternalServerErrorException(
            `Operation ${operationName} failed after ${maxRetries} attempts: ${error.message}`,
          );
        }
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async storeStream(
    bucket: GridFSBucket,
    stream: Readable,
    filename: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(filename);
      stream
        .pipe(uploadStream)
        .on("finish", () => resolve(uploadStream.id.toString()))
        .on("error", (err) => {
          this.logger.error(
            `Failed to store stream ${filename}: ${err.message}`,
          );
          reject(err);
        });
    });
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream
        .on("data", (chunk) => chunks.push(Buffer.from(chunk)))
        .on("end", () => resolve(Buffer.concat(chunks)))
        .on("error", (err) => reject(err));
    });
  }

  private async generateThumbnailWithFallback(
    script: string,
    imageSearchQuery: string,
    jobId: string,
  ): Promise<Readable> {
    try {
      const thumbnailStream = await this.thumbnailService.generateStream(
        script,
        `thumbnail_${jobId}.png`,
      );
      if (thumbnailStream) return thumbnailStream;
      this.logger.warn(
        "Thumbnail generation failed, using Pixabay fallback...",
      );
      const illustrationStreams =
        await this.pixabayService.searchAndDownloadIllustrationStreams(
          imageSearchQuery,
        );
      return illustrationStreams.length > 0
        ? illustrationStreams[0]
        : Readable.from([]);
    } catch (error) {
      this.logger.error(`Error in thumbnail generation: ${error.message}`);
      throw new InternalServerErrorException("Thumbnail generation failed");
    }
  }

  @Post()
  async generateVideo(@Body("prompt") prompt: string): Promise<Job> {
    if (!prompt) {
      throw new InternalServerErrorException("Prompt is required");
    }

    this.logger.log(`Starting video generation for prompt: ${prompt}`);
    const bucket = new GridFSBucket(this.connection.db);
    const job: any = {
      _id: new Types.ObjectId(),
      prompt,
      videoDetails: { title: "", description: "", tags: [], thumbnailId: "" },
      videoClipIds: [],
      backgroundMusicId: null,
    };

    if (!job._id) {
      throw new InternalServerErrorException("Job ID not generated");
    }

    try {
      // Step 1: Generate script and metadata
      console.time("script-and-metadata");
      const [
        script,
        title,
        description,
        tags,
        imageSearchQuery,
        videoSearchQuery,
      ] = await Promise.all([
        this.retryOperation(
          () => this.scriptService.generateScript(prompt),
          "Script generation",
        ),
        this.retryOperation(
          () => this.scriptService.generateVideoTitle(prompt),
          "Title generation",
        ),
        this.retryOperation(
          () => this.scriptService.generateVideoDescription(prompt),
          "Description generation",
        ),
        this.retryOperation(
          () => this.scriptService.generateTags(prompt),
          "Tags generation",
        ),
        this.retryOperation(
          () => this.scriptService.generateImageSearchQuery(prompt),
          "Image query generation",
        ),
        this.retryOperation(
          () => this.scriptService.generateVideoSearchQuery(prompt),
          "Video query generation",
        ),
      ]);
      job.script = script;
      job.videoDetails.title = title;
      job.videoDetails.description = description;
      job.videoDetails.tags = tags;
      console.timeEnd("script-and-metadata");

      // Step 2: Generate media (audio, videos, thumbnail, music)
      console.time("media-generation");
      const [audioStream, videoStreams, thumbnailStream, musicStream] =
        await Promise.all([
          this.retryOperation(
            () =>
              this.ttsService.synthesizeStream(
                script,
                `audio_${job._id.toString()}.wav`,
              ),
            "Audio generation",
          ),
          this.retryOperation(
            () =>
              this.pixabayService.searchAndDownloadVideoStreams(
                videoSearchQuery,
              ),
            "Video search",
          ),
          this.retryOperation(
            () =>
              this.generateThumbnailWithFallback(
                script,
                imageSearchQuery,
                job._id.toString(),
              ),
            "Thumbnail generation",
          ),
          this.retryOperation(
            () =>
              this.pixabayService.searchAndDownloadMusicStream(
                videoSearchQuery,
              ),
            "Music search",
          ),
        ]);
      console.timeEnd("media-generation");

      // Store media in GridFS
      console.time("store-media");
      const [audioId, videoClipIds, thumbnailId, backgroundMusicId] =
        await Promise.all([
          this.storeStream(
            bucket,
            audioStream,
            `audio_${job._id.toString()}.wav`,
          ),
          Promise.all(
            videoStreams.map((stream, i) =>
              this.storeStream(
                bucket,
                stream,
                `video_${job._id.toString()}_${i}.mp4`,
              ),
            ),
          ),
          this.storeStream(
            bucket,
            thumbnailStream,
            `thumbnail_${job._id.toString()}.png`,
          ),
          musicStream
            ? this.storeStream(
                bucket,
                musicStream,
                `music_${job._id.toString()}.wav`,
              )
            : Promise.resolve(null),
        ]);
      job.audioId = audioId;
      job.videoClipIds = videoClipIds;
      job.videoDetails.thumbnailId = thumbnailId;
      job.backgroundMusicId = backgroundMusicId;
      console.timeEnd("store-media");

      // Step 3: Generate subtitles via FastAPI VOSK
      console.time("subtitle-generation");
      const audioDownloadStream = bucket.openDownloadStream(
        new Types.ObjectId(audioId),
      );
      const audioBuffer = await this.streamToBuffer(audioDownloadStream);
      const subtitleResponse = await this.retryOperation(async () => {
        const response = await lastValueFrom(
          this.httpService.post("http://localhost:8000/subtitles", {
            audio: audioBuffer.toString("base64"),
          }),
        );
        return response.data.srt;
      }, "Subtitle generation");
      const subtitleStream = Readable.from(subtitleResponse);
      const subtitleId = await this.storeStream(
        bucket,
        subtitleStream,
        `subtitles_${job._id.toString()}.srt`,
      );
      job.subtitleId = subtitleId;
      console.timeEnd("subtitle-generation");

      // Step 4: Merge video
      console.time("video-merge");
      const finalVideoStream = await this.retryOperation(
        () =>
          this.ffmpegService.mergeAll({
            clipStreams: videoClipIds.map((id) =>
              bucket.openDownloadStream(new Types.ObjectId(id)),
            ),
            audioStream: bucket.openDownloadStream(new Types.ObjectId(audioId)),
            musicStream: backgroundMusicId
              ? bucket.openDownloadStream(new Types.ObjectId(backgroundMusicId))
              : null,
            subtitleId,
            thumbnailId,
            bucket,
          }),
        "Video merge",
      );
      const finalVideoId = await this.storeStream(
        bucket,
        finalVideoStream,
        finalVideoStream["filename"],
      );
      job.finalVideoId = finalVideoId;
      console.timeEnd("video-merge");

      // Step 5: Upload to YouTube
      console.time("video-upload");
      const uploadResult = await this.retryOperation(
        () =>
          this.youtubeService.uploadVideoStream(
            finalVideoStream,
            job.videoDetails.title,
            job.videoDetails.description,
            job.videoDetails.tags,
            bucket,
            finalVideoId,
          ),
        "Video upload",
      );
      const youtubeVideoId = uploadResult?.id;
      const youtubeVideoUrl = uploadResult?.url;
      await this.retryOperation(
        () =>
          this.youtubeService.uploadVideoStream(
            finalVideoStream,
            job.videoDetails.title,
            job.videoDetails.description,
            job.videoDetails.tags,
            bucket,
            finalVideoId,
          ),
        "Video upload",
      );
      job.youtubeVideoId = youtubeVideoId;
      job.youtubeVideoUrl = youtubeVideoUrl;
      console.timeEnd("video-upload");

      // Save job to MongoDB (assuming JobModel is injected)
      // await this.jobModel.create(job);

      this.logger.log(
        `Video generation completed for job: ${job._id.toString()}`,
      );
      return job as Job;
    } catch (error) {
      this.logger.error(
        `Video generation failed for job ${job._id.toString()}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        `Video generation failed for job ${job._id.toString()}: ${error.message}`,
      );
    }
  }
}
