import {
  Controller,
  Post,
  Body,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Connection, Model, Types } from "mongoose";
import { Db, GridFSBucket } from "mongodb";
import { Readable } from "stream";
import { lastValueFrom } from "rxjs";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { FfmpegService } from "src/shared/ffmpeg/ffmpeg.service";
import { PixabayService } from "src/shared/pixabay/pixabay.service";
import { MusicService } from "src/shared/music/music.service";
import { ScriptService } from "src/shared/script/script.service";
import { ThumbNailService } from "src/shared/thumbnail/thumbnail.service";
import { TTSService } from "src/shared/tts/tts.service";
import { YoutubeService } from "./video.service";
import { Job } from "src/schemas";
import { UtilityService } from "src/shared/utility/utility.service";
import { StorageService } from "src/shared/storage/storage.service";
import { ConfigService } from "@nestjs/config";

@Controller("automate/video")
export class VideoController {
  private readonly logger = new Logger(VideoController.name);
  private readonly subtitleUrl: string;

  constructor(
    @InjectModel(Job.name) private readonly jobModel: Model<Job>,
    private readonly scriptService: ScriptService,
    private readonly pixabayService: PixabayService,
    private readonly musicService: MusicService,
    private readonly thumbnailService: ThumbNailService,
    private readonly ttsService: TTSService,
    private readonly ffmpegService: FfmpegService,
    private readonly youtubeService: YoutubeService,
    private readonly httpService: HttpService,
    private readonly utilityService: UtilityService,
    private readonly storageService: StorageService,
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {
    this.subtitleUrl = this.configService.get<string>(
      "SUBTITLE_MICROSERVICE_URL",
      "https://yta-subtitle-microservice.onrender.com/subtitles",
    );
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  }

  @Post()
  async generateVideo(@Body("prompt") prompt: string): Promise<Job> {
    if (!prompt) {
      throw new InternalServerErrorException("Prompt is required");
    }

    this.logger.log(`Starting video generation for prompt: ${prompt}`);
    const bucket = new GridFSBucket(this.connection.db as Db);
    const job = new this.jobModel({
      _id: new Types.ObjectId().toString(),
      prompt,
      videoDetails: { title: "", description: "", tags: [], thumbnailId: "" },
    });

    if (!job || !job._id) {
      throw new InternalServerErrorException("Job ID not generated");
    }

    try {
      const {
        script,
        title,
        description,
        tags,
        imageSearchQuery,
        videoSearchQuery,
      } = await this.scriptService.generateScriptAndMetadata(prompt, job);
      job.script = script;
      job.videoDetails.title = title;
      job.videoDetails.description = description;
      job.videoDetails.tags = tags;

      // Step 2: Generate media (audio, videos, thumbnail, music)
      console.time("media-generation-and-raw-storage");
      const [rawAudioId, musicData, videoClipIds, thumbnailId] =
        await Promise.all([
          this.utilityService.retryOperation(async () => {
            const rawAudioStream = await this.ttsService.synthesizeStream(
              script,
              `raw_audio_${job._id.toString()}.raw`,
            );
            return this.storageService.storeStream(
              bucket,
              rawAudioStream,
              `raw_audio_${job._id.toString()}.raw`,
            );
          }, "Raw Audio generation and storage"),
          this.utilityService.retryOperation(
            () => this.musicService.searchSounds(),
            "Music search",
          ),
          this.utilityService.retryOperation(
            () =>
              this.pixabayService.searchAndStoreVideoClips(
                job,
                bucket,
                videoSearchQuery,
              ),
            "Video search and storage",
          ),
          this.utilityService.retryOperation(async () => {
            const thumbnailStream =
              await this.thumbnailService.generateThumbnailWithFallback(
                script,
                imageSearchQuery,
                job._id.toString(),
              );
            return this.storageService.storeStream(
              bucket,
              thumbnailStream,
              `thumbnail_${job._id.toString()}.png`,
            );
          }, "Thumbnail generation and storage"),
        ]);
      job.videoClipIds = videoClipIds;
      job.videoDetails.thumbnailId = thumbnailId;
      console.timeEnd("media-generation-and-raw-storage");

      await this.ttsService.processAndStoreAudio(job, bucket, rawAudioId);

      await this.musicService.selectAndStoreBackgroundMusic(job, musicData);
      console.timeEnd("store-media");

      // Step 3: Generate subtitles via FastAPI VOSK
      console.time("subtitle-generation");
      const audioDownloadStream = bucket.openDownloadStream(
        new Types.ObjectId(job.audioId),
      );
      const audioBuffer = await this.streamToBuffer(audioDownloadStream);
      const subtitleResponse = await this.utilityService.retryOperation(
        async () => {
          const response = await lastValueFrom(
            this.httpService.post(this.subtitleUrl, {
              audio: audioBuffer.toString("base64"),
            }),
          );
          return response.data.srt;
        },
        "Subtitle generation",
      );
      const subtitleStream = Readable.from(subtitleResponse);
      const subtitleId = await this.storageService.storeStream(
        bucket,
        subtitleStream,
        `subtitles_${job._id.toString()}.srt`,
      );
      job.subtitleId = subtitleId;
      console.timeEnd("subtitle-generation");

      // Step 4: Merge video
      console.time("video-merge");
      const finalVideoStream = await this.utilityService.retryOperation(
        () =>
          this.ffmpegService.mergeAll({
            clipStreams: job.videoClipIds.map((id) =>
              bucket.openDownloadStream(new Types.ObjectId(id)),
            ),
            audioStream: bucket.openDownloadStream(
              new Types.ObjectId(job.audioId),
            ),
            musicStream: job.backgroundMusicId
              ? bucket.openDownloadStream(
                  new Types.ObjectId(job.backgroundMusicId),
                )
              : null,
            subtitleId: job.subtitleId,
            thumbnailId: job.videoDetails.thumbnailId,
            bucket,
          }),
        "Video merge",
      );
      const finalVideoId = await this.storageService.storeStream(
        bucket,
        finalVideoStream,
        finalVideoStream["filename"],
      );
      job.finalVideoId = finalVideoId;
      console.timeEnd("video-merge");

      // Step 5: Upload to YouTube
      console.time("video-upload");
      const uploadResult = await this.utilityService.retryOperation(
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
      job.youtubeVideoId = uploadResult?.id;
      job.youtubeVideoUrl = uploadResult?.url;
      console.timeEnd("video-upload");

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
