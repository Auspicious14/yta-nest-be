import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import { StorageService } from "../storage/storage.service";
import { UtilityService } from "../utility/utility.service";
import { Job } from "src/types/jobTypes";
import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);
  private cloudinaryCloudName: string | undefined;
  private cloudinaryApiKey: string | undefined;
  private cloudinaryApiSecret: string | undefined;

  constructor(
    private configService: ConfigService,
    @InjectConnection() private readonly connection: Connection,
    private readonly storageService: StorageService,
    private readonly utilityService: UtilityService,
  ) {
    this.cloudinaryCloudName = this.configService.get<string>(
      "CLOUDINARY_CLOUD_NAME",
    );
    this.cloudinaryApiKey =
      this.configService.get<string>("CLOUDINARY_API_KEY");
    this.cloudinaryApiSecret = this.configService.get<string>(
      "CLOUDINARY_API_SECRET",
    );

    cloudinary.config({
      cloud_name: this.cloudinaryCloudName,
      api_key: this.cloudinaryApiKey,
      api_secret: this.cloudinaryApiSecret,
      secure: true,
    });
  }

  async searchSounds(): Promise<any> {
    this.logger.log(`[searchSounds] Searching for sounds`);
    try {
      const result = await cloudinary.api.resources({
        type: "upload",
        prefix: "audio/",
        resource_type: "video",
        max_results: 15,
        // tags: query,
      });

      if (!result || !result.resources || result.resources.length === 0) {
        this.logger.warn(
          '[searchSounds] No music found in Cloudinary "audio" folder.',
        );
        return [];
      }
      this.logger.log(
        `[searchSounds] Found ${result.resources.length} resources.`,
      );

      // Return a list of public_ids or URLs that can be used to fetch the music streams
      const mappedResults = result.resources.map((resource) => ({
        public_id: resource.public_id,
        url: resource.secure_url,
      }));
      this.logger.log(
        `[searchSounds] Returning ${mappedResults.length} search results.`,
      );
      return mappedResults;
    } catch (error) {
      this.logger.error(
        `[searchSounds] Error searching music in Cloudinary: ${error.response?.data || error.message || error.toString()}`,
      );
      throw new Error("Failed to search music in Cloudinary.");
    }
  }

  async downloadMusicAndSaveToGridFS(
    publicId: string,
    filename: string,
  ): Promise<string> {
    try {
      const musicStream = await this.getCloudinaryMusicStream(publicId);
      const gridFsId = await this.storageService.storeStream(
        musicStream,
        filename,
      );
      return gridFsId;
    } catch (error) {
      this.logger.error(
        `Error processing Cloudinary music (publicId: ${publicId}):`,
        error.message,
      );
      throw new Error(`Failed to process Cloudinary music: ${publicId}`);
    }
  }

  async getCloudinaryMusicStream(publicId: string): Promise<Readable> {
    try {
      const url = cloudinary.url(publicId, {
        resource_type: "video",
        sign_url: true,
      });
      const response = await axios.get(url, { responseType: "stream" });
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error fetching music from Cloudinary (publicId: ${publicId}):`,
        error.response?.data || error.message,
      );
      throw new Error(`Failed to fetch music from Cloudinary: ${publicId}`);
    }
  }

  async selectAndStoreBackgroundMusic(
    job: Job,
    musicData: any[],
  ): Promise<void> {
    this.logger.log(
      "[selectAndStoreBackgroundMusic] Selecting and storing background music.",
    );
    console.time("select-and-store-music");
    const selectedMusic =
      musicData[Math.floor(Math.random() * musicData.length)];
    if (selectedMusic) {
      job.backgroundMusicId = await this.utilityService.retryOperation(
        () =>
          this.downloadMusicAndSaveToGridFS(
            selectedMusic.public_id,
            `music_${job._id.toString()}.mp3`,
          ),
        "Background music download and storage",
      );
    } else {
      this.logger.warn("No background music found for the given prompt.");
    }
    console.timeEnd("select-and-store-music");
  }
}
