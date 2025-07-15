import {
  Controller,
  Post,
  Body,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Connection, Types } from "mongoose";
import { Db, GridFSBucket } from "mongodb";
import { Readable } from "stream";
import { lastValueFrom } from "rxjs";
import { InjectConnection } from "@nestjs/mongoose";
import { FfmpegService } from "src/shared/ffmpeg/ffmpeg.service";
import { PixabayService } from "src/shared/pixabay/pixabay.service";
import { MusicService } from "src/shared/music/music.service";
import { ScriptService } from "src/shared/script/script.service";
import { ThumbNailService } from "src/shared/thumbnail/thumbnail.service";
import { TTSService } from "src/shared/tts/tts.service";
import { YoutubeService } from "./video.service";
import { Job, VideoDetails } from "src/types/jobTypes";

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
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Retries an asynchronous operation multiple times with exponential backoff.
   * @param operation The asynchronous function to retry.
   * @param operationName A descriptive name for the operation (for logging).
   * @param maxRetries The maximum number of retry attempts.
   * @param baseDelay The base delay in milliseconds before the first retry.
   * @returns A promise that resolves with the result of the operation or rejects if all retries fail.
   */
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

  /**
   * Stores a readable stream into GridFS.
   * @param bucket The GridFSBucket instance.
   * @param stream The readable stream to store.
   * @param filename The desired filename for the stored stream.
   * @returns A promise that resolves with the ID of the stored file.
   */
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

  /**
   * Converts a readable stream into a Buffer.
   * @param stream The readable stream to convert.
   * @returns A promise that resolves with the concatenated Buffer of the stream's data.
   */
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream
        .on("data", (chunk) => chunks.push(Buffer.from(chunk)))
        .on("end", () => resolve(Buffer.concat(chunks)))
        .on("error", (err) => reject(err));
    });
  }

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
  @Post()
  async generateVideo(@Body("prompt") prompt: string): Promise<Job> {
    if (!prompt) {
      throw new InternalServerErrorException("Prompt is required");
    }

    this.logger.log(`Starting video generation for prompt: ${prompt}`);
    const bucket = new GridFSBucket(this.connection.db as Db);
    const job: any = {
      _id: new Types.ObjectId().toString(),
      prompt,
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
      const { script, title, description, tags, imageSearchQuery, videoSearchQuery } =
        await this._generateScriptAndMetadata(prompt, job);
      job.script = script;
      job.videoDetails.title = title;
      job.videoDetails.description = description;
      job.videoDetails.tags = tags;

      // Step 2: Generate media (audio, videos, thumbnail, music)
      console.time("media-generation-and-raw-storage");
      const [rawAudioId, musicData, videoClipIds, thumbnailId] =
        await Promise.all([
          this.retryOperation(
            async () => {
              const rawAudioStream = await this.ttsService.synthesizeStream(
                script,
                `raw_audio_${job._id.toString()}.raw`,
              );
              return this.storeStream(
                bucket,
                rawAudioStream,
                `raw_audio_${job._id.toString()}.raw`,
              );
            },
            "Raw Audio generation and storage",
          ),
          this.retryOperation(
            () => this.musicService.searchSounds(videoSearchQuery),
            "Music search",
          ),
          this.retryOperation(
            () => this._searchAndStoreVideoClips(job, bucket, videoSearchQuery),
            "Video search and storage",
          ),
          this.retryOperation(
            async () => {
              const thumbnailStream = await this.generateThumbnailWithFallback(
                script,
                imageSearchQuery,
                job._id.toString(),
              );
              return this.storeStream(
                bucket,
                thumbnailStream,
                `thumbnail_${job._id.toString()}.png`,
              );
            },
            "Thumbnail generation and storage",
          ),
        ]);
      job.videoClipIds = videoClipIds;
      job.videoDetails.thumbnailId = thumbnailId;
      console.timeEnd("media-generation-and-raw-storage");

      await this._processAndStoreAudio(job, bucket, rawAudioId);

      await this._selectAndStoreBackgroundMusic(job, musicData);

      // Select a random music track from the search results
      const selectedMusic =
        musicData[Math.floor(Math.random() * musicData.length)];
      if (selectedMusic) {
        job.backgroundMusicId =
          await this.musicService.downloadMusicAndSaveToGridFS(
            selectedMusic.public_id,
            `music_${job._id.toString()}.mp3`,
          );
      } else {
        this.logger.warn("No background music found for the given prompt.");
      }
      console.timeEnd("store-media");

      // // Step 3: Generate subtitles via FastAPI VOSK
      // console.time("subtitle-generation");
      // const audioDownloadStream = bucket.openDownloadStream(
      //   new Types.ObjectId(audioId),
      // );
      // const audioBuffer = await this.streamToBuffer(audioDownloadStream);
      // const subtitleResponse = await this.retryOperation(async () => {
      //   const response = await lastValueFrom(
      //     this.httpService.post("https://yta-subtitle-microservice.onrender.com/subtitles", {
      //       audio: audioBuffer.toString("base64"),
      //     }),
      //   );
      //   return response.data.srt;
      // }, "Subtitle generation");
      // const subtitleStream = Readable.from(subtitleResponse);
      // const subtitleId = await this.storeStream(
      //   bucket,
      //   subtitleStream,
      //   `subtitles_${job._id.toString()}.srt`,
      // );
      // job.subtitleId = subtitleId;
      // console.timeEnd("subtitle-generation");

      // // Step 4: Merge video
      // console.time("video-merge");
      // const finalVideoStream = await this.retryOperation(
      //   () =>
      //     this.ffmpegService.mergeAll({
      //       clipStreams: videoClipIds.map((id) =>
      //         bucket.openDownloadStream(new Types.ObjectId(id)),
      //       ),
      //       audioStream: bucket.openDownloadStream(new Types.ObjectId(audioId)),
      //       musicStream: backgroundMusicId
      //         ? bucket.openDownloadStream(new Types.ObjectId(backgroundMusicId))
      //         : null,
      //       subtitleId,
      //       thumbnailId,
      //       bucket,
      //     }),
      //   "Video merge",
      // );
      // const finalVideoId = await this.storeStream(
      //   bucket,
      //   finalVideoStream,
      //   finalVideoStream["filename"],
      // );
      // job.finalVideoId = finalVideoId;
      // console.timeEnd("video-merge");

      // // Step 5: Upload to YouTube
      // console.time("video-upload");
      // const uploadResult = await this.retryOperation(
      //   () =>
      //     this.youtubeService.uploadVideoStream(
      //       finalVideoStream,
      //       job.videoDetails.title,
      //       job.videoDetails.description,
      //       job.videoDetails.tags,
      //       bucket,
      //       finalVideoId,
      //     ),
      //   "Video upload",
      // );
      // const youtubeVideoId = uploadResult?.id;
      // const youtubeVideoUrl = uploadResult?.url;
      // await this.retryOperation(
      //   () =>
      //     this.youtubeService.uploadVideoStream(
      //       finalVideoStream,
      //       job.videoDetails.title,
      //       job.videoDetails.description,
      //       job.videoDetails.tags,
      //       bucket,
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

  /**
   * Generates script and metadata for the video based on the prompt.
   * @param prompt The user's input prompt.
   * @returns An object containing the script, title, description, tags, image search query, and video search query.
   */
  private async _generateScriptAndMetadata(
    prompt: string,
    job: Job,
  ): Promise<
    {
      script: string;
      title: string;
      description: string;
      tags: string[];
      imageSearchQuery: string;
      videoSearchQuery: string;
    }
  > {
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
    console.timeEnd("script-and-metadata");
    return { script, title, description, tags, imageSearchQuery, videoSearchQuery };
  }

  /**
   * Processes the raw audio stream to 16kHz mono WAV format and stores it in GridFS.
   * @param job The current job object.
   * @param bucket The GridFSBucket instance.
   * @param rawAudioId The ID of the raw audio stream in GridFS.
   */
  private async _processAndStoreAudio(
    job: Job,
    bucket: GridFSBucket,
    rawAudioId: string,
  ): Promise<void> {
    console.time("process-and-store-audio");
    const rawAudioReadStream = bucket.openDownloadStream(new Types.ObjectId(rawAudioId));
    const processedAudioStream = await this.retryOperation(
      () =>
        this.ttsService.convertTo16kHzMonoWav(
          rawAudioReadStream,
          `audio_${job._id.toString()}.wav`,
        ),
      "Audio preprocessing",
    );
    const audioId = await this.storeStream(
      bucket,
      processedAudioStream,
      `audio_${job._id.toString()}.wav`,
    );
    job.audioId = audioId;
    console.timeEnd("process-and-store-audio");
  }

  /**
   * Selects a random background music track and stores it in GridFS.
   * @param job The current job object.
   * @param musicData An array of music data objects.
   */
  private async _selectAndStoreBackgroundMusic(
    job: Job,
    musicData: any[],
  ): Promise<void> {
    console.time("select-and-store-music");
    const selectedMusic =
      musicData[Math.floor(Math.random() * musicData.length)];
    if (selectedMusic) {
      job.backgroundMusicId =
        await this.musicService.downloadMusicAndSaveToGridFS(
          selectedMusic.public_id,
          `music_${job._id.toString()}.mp3`,
        );
    } else {
      this.logger.warn("No background music found for the given prompt.");
    }
    console.timeEnd("select-and-store-music");
  }

  /**
   * Searches for video clips based on the query and stores them in GridFS.
   * @param job The current job object.
   * @param bucket The GridFSBucket instance.
   * @param videoSearchQuery The query for video search.
   * @returns A promise that resolves to an array of stored video clip IDs.
   */
  private async _searchAndStoreVideoClips(
    job: Job,
    bucket: GridFSBucket,
    videoSearchQuery: string,
  ): Promise<string[]> {
    const videoStreams = await this.pixabayService.searchAndDownloadVideoStreams(
      videoSearchQuery,
    );
    return Promise.all(
      videoStreams.map((stream, i) =>
        this.storeStream(
          bucket,
          stream,
          `video_${job._id.toString()}_${i}.mp4`,
        ),
      ),
    );
  }
}
