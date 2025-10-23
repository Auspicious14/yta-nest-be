import { Injectable, Logger } from "@nestjs/common";
import { EdgeTTS } from "@andresaya/edge-tts";
import { PassThrough, Readable } from "stream";
import * as ffmpeg from "fluent-ffmpeg";
import * as path from "path";
import * as fs from "fs/promises";
import { Types } from "mongoose";
import { GridFSBucket } from "mongodb";
import { JobDocument } from "src/schemas";
import { UtilityService } from "../utility/utility.service";
import { StorageService } from "../storage/storage.service";

@Injectable()
export class TTSService {
  private readonly logger = new Logger(TTSService.name);

  constructor(
    private readonly tts: EdgeTTS,
    private readonly utilityService: UtilityService,
    private readonly storageService: StorageService,
  ) {}

  async synthesizeStream(
    text: string,
    filename: string,
    voice: string = "en-US-AriaNeural",
  ): Promise<Readable> {
    this.logger.log(
      `[synthesizeStream] Attempting to generate audio stream for text: ${text.slice(0, 50)}...`,
    );

    try {
      this.logger.log(`[synthesizeStream] Calling EdgeTTS.synthesize...`);
      // Generate audio using EdgeTTS
      await this.tts.synthesize(text, voice, {
        rate: "0%",
        pitch: "0Hz",
        volume: "0%",
      });

      const audioBuffer = this.tts.toRaw();
      this.logger.log(
        `[synthesizeStream] EdgeTTS.toRaw() returned buffer of length: ${audioBuffer ? audioBuffer.length : 0}`,
      );
      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error("Empty audio buffer generated");
      }

      // Convert buffer to stream
      let audioStream = Readable.from(audioBuffer);
      this.logger.log(
        `[synthesizeStream] Converted audio buffer to readable stream.`,
      );

      this.logger.log(
        `[synthesizeStream] Raw audio stream generated successfully for: ${filename}`,
      );
      // Attach filename for GridFS storage (optional, can be done later)
      audioStream["filename"] = filename || `audio_${Date.now()}.raw`;
      return audioStream;
    } catch (error) {
      this.logger.error(`Audio generation failed: ${error.message}`);
      throw new Error(`Failed to generate audio stream: ${error.message}`);
    }
  }

  async convertTo16kHzMonoWav(
    inputStream: Readable,
    filename: string,
  ): Promise<Readable> {
    this.logger.log(`[convertTo16kHzMonoWav] Starting audio preprocessing.`);
    return new Promise((resolve, reject) => {
      const outputStream = new PassThrough();

      if (inputStream.readableEnded) {
        this.logger.error(
          "[convertTo16kHzMonoWav] Input stream has already ended",
        );
        reject(new Error("Input stream has already ended"));
        return;
      }

      this.logger.log("[convertTo16kHzMonoWav] Initializing ffmpeg command.");
      ffmpeg()
        .input(inputStream)
        .inputOptions([
          "-t 30", // Add a timeout of 30 seconds to prevent indefinite hangs
          "-f s16le", // Signed 16-bit little-endian PCM
          "-ar 24000", // Audio sample rate (common for EdgeTTS output)
          "-ac 1", // Audio channels (EdgeTTS is typically mono)
        ])
        .audioFrequency(16000)
        .audioChannels(1)
        .format("wav")
        .on("start", (commandLine) => {
          this.logger.log(
            `[convertTo16kHzMonoWav] Ffmpeg command started: ${commandLine}`,
          );
        })
        .on("codecData", (data) => {
          this.logger.log(
            `[convertTo16kHzMonoWav] Ffmpeg codec data: ${JSON.stringify(data)}`,
          );
        })
        .on("progress", (progress) => {
          this.logger.log(
            `[convertTo16kHzMonoWav] Ffmpeg progress: ${progress.percent ? progress.percent.toFixed(2) + "%" : "N/A"} processed`,
          );
        })
        .on("error", (err) => {
          this.logger.error(
            `[convertTo16kHzMonoWav] Audio preprocessing failed: ${err.message}`,
          );
          reject(err);
        })
        .on("stderr", (stderrOutput) => {
          if (
            stderrOutput.toLowerCase().includes("error") ||
            stderrOutput.toLowerCase().includes("failed")
          ) {
            this.logger.error(
              `[convertTo16kHzMonoWav] FFmpeg stderr error: ${stderrOutput}`,
            );
          } else {
            this.logger.debug(
              `[convertTo16kHzMonoWav] FFmpeg stderr output: ${stderrOutput}`,
            );
          }
        })
        .on("end", () => {
          this.logger.log(
            "[convertTo16kHzMonoWav] Audio preprocessing completed",
          );
          resolve(outputStream);
        })
        .pipe(outputStream, { end: true });
    });
  }
  /**
   * Processes the raw audio stream to 16kHz mono WAV format and stores it in GridFS.
   * @param job The current job object.
   * @param bucket The GridFSBucket instance.
   * @param rawAudioId The ID of the raw audio stream in GridFS.
   */
  // async processAndStoreAudio(
  //   job: JobDocument,
  //   bucket: GridFSBucket,
  //   rawAudioId: string,
  // ): Promise<void> {
  //   console.time("process-and-store-audio");
  //   const rawAudioReadStream = bucket.openDownloadStream(
  //     new Types.ObjectId(rawAudioId),
  //   );
  //   const processedAudioStream = await this.utilityService.retryOperation(
  //     () =>
  //       this.convertTo16kHzMonoWav(
  //         rawAudioReadStream,
  //         `audio_${(job._id as any).toString()}.wav`,
  //       ),
  //     "Audio preprocessing",
  //   );
  //   const audioId = await this.storageService.storeStream(
  //     bucket,
  //     processedAudioStream,
  //     `audio_${(job._id as any).toString()}.wav`,
  //   );
  //   job.audioUrl = audioId;
  //   console.timeEnd("process-and-store-audio");
  // }
}
