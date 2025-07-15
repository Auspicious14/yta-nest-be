import {
  Controller,
  Post,
  Body,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Types } from "mongoose";
import { StorageService } from "src/shared/storage/storage.service";
import { Readable } from "stream";
import { FfmpegService } from "src/shared/ffmpeg/ffmpeg.service";
import { PixabayService } from "src/shared/pixabay/pixabay.service";
import { MusicService } from "src/shared/music/music.service";
import { ScriptService } from "src/shared/script/script.service";
import { ThumbNailService } from "src/shared/thumbnail/thumbnail.service";
import { TTSService } from "src/shared/tts/tts.service";
import { YoutubeService } from "./video.service";
import { Job, VideoDetails } from "src/types/jobTypes";
import { GridFSBucket } from "mongodb";
import { UtilityService } from "src/shared/utility/utility.service";

@Controller("automate/video")
export class VideoController {
  private readonly logger = new Logger(VideoController.name);

  constructor(
    private readonly scriptService: ScriptService,
    private readonly pixabayService: PixabayService,
    private readonly musicService: MusicService,
    private readonly thumbnailService: ThumbNailService,
    private readonly ttsService: TTSService,
    private readonly ffmpegService: FfmpegService,
    private readonly youtubeService: YoutubeService,
    private readonly httpService: HttpService,
    private readonly storageService: StorageService,
    private readonly utilityService: UtilityService,
  ) {}
  /**
   * Generates a thumbnail stream, with a fallback to Pixabay if generation fails.
   * @param script The script content for thumbnail generation.
   * @param imageSearchQuery The query to search for fallback images on Pixabay.
   * @param jobId The ID of the current job.
   * @returns A promise that resolves with a readable stream of the thumbnail image.
   */
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
    const job: Job = {
      _id: new Types.ObjectId().toString(),
      prompt,
      script: null,
      videoDetails: { title: "", description: "", tags: [], thumbnailId: "" },
      videoClipIds: [],
      backgroundMusicId: null,
      audioId: null,
      subtitleId: null,
      finalVideoId: null,
      youtubeVideoId: null,
      youtubeVideoUrl: null,
    };

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
      } = await this.scriptService.generateScriptAndMetadata(prompt);
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
                job._id.toString(),
                videoSearchQuery,
              ),
            "Video search and storage",
          ),
          this.utilityService.retryOperation(async () => {
            const thumbnailStream = await this.generateThumbnailWithFallback(
              script,
              imageSearchQuery,
              job._id.toString(),
            );
            return this.storageService.storeStream(
              thumbnailStream,
              `thumbnail_${job._id.toString()}.png`,
            );
          }, "Thumbnail generation and storage"),
        ]);

      job.videoClipIds = videoClipIds;
      job.videoDetails.thumbnailId = thumbnailId;
      console.timeEnd("media-generation-and-raw-storage");

      await this.ttsService.processAndStoreAudio(job, rawAudioId);

      await this.musicService.selectAndStoreBackgroundMusic(job, musicData);

      console.timeEnd("store-media");

      // // Step 3: Generate subtitles via FastAPI VOSK
      // console.time("subtitle-generation");
      // const audioDownloadStream = this.storageService.openDownloadStream(
      //   audioId,
      // );
      // const audioBuffer = await this.storageService.streamToBuffer(audioDownloadStream);
      // const subtitleResponse = await this.utilityService.retryOperation(async () => {
      //   const response = await lastValueFrom(
      //     this.httpService.post("https://yta-subtitle-microservice.onrender.com/subtitles", {
      //       audio: audioBuffer.toString("base64"),
      //     }),
      //   );
      //   return response.data.srt;
      // }, "Subtitle generation");
      // const subtitleStream = Readable.from(subtitleResponse);
      // const subtitleId = await this.storageService.storeStream(
      //   subtitleStream,
      //   `subtitles_${job._id.toString()}.srt`,
      // );
      // job.subtitleId = subtitleId;
      // console.timeEnd("subtitle-generation");

      // // Step 4: Merge video
      // console.time("video-merge");
      // const finalVideoStream = await this.utilityService.retryOperation(
      //   () =>
      //     this.ffmpegService.mergeAll({
      //       clipStreams: videoClipIds.map((id) =>
      //         this.storageService.openDownloadStream(id),
      //       ),
      //       audioStream: this.storageService.openDownloadStream(audioId),
      //       musicStream: backgroundMusicId
      //         ? this.storageService.openDownloadStream(backgroundMusicId)
      //         : null,
      //       subtitleId,
      //       thumbnailId,
      //       bucket: this.storageService.getBucket(),
      //     }),
      //   "Video merge",
      // );
      // const finalVideoId = await this.storageService.storeStream(
      //   finalVideoStream,
      //   finalVideoStream["filename"],
      // );
      // job.finalVideoId = finalVideoId;
      // console.timeEnd("video-merge");

      // // Step 5: Upload to YouTube
      // console.time("video-upload");
      // const uploadResult = await this.utilityService.retryOperation(
      //   () =>
      //     this.youtubeService.uploadVideoStream(
      //       finalVideoStream,
      //       job.videoDetails.title,
      //       job.videoDetails.description,
      //       job.videoDetails.tags,
      //       this.storageService.getBucket(),
      //       finalVideoId,
      //     ),
      //   "Video upload",
      // );
      // const youtubeVideoId = uploadResult?.id;
      // const youtubeVideoUrl = uploadResult?.url;
      // await this.utilityService.retryOperation(
      //   () =>
      //     this.youtubeService.uploadVideoStream(
      //       finalVideoStream,
      //       job.videoDetails.title,
      //       job.videoDetails.description,
      //       job.videoDetails.tags,
      //       this.storageService.getBucket(),
      //       finalVideoId,
      //     ),
      //   "Video upload",
      // );
      // job.youtubeVideoId = youtubeVideoId;
      // job.youtubeVideoUrl = youtubeVideoUrl;
      // console.timeEnd("video-upload");

      // // Save job to MongoDB (assuming JobModel is injected)
      // // await this.jobModel.create(job);

      // this.logger.log(
      //   `Video generation completed for job: ${job._id.toString()}`,
      // );
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
