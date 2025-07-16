/*import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import path from 'path';
import { lastValueFrom } from 'rxjs';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PixabayService {
  private API_KEY: string | undefined;
  private readonly BASE_URL = 'https://pixabay.com/api';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.API_KEY = this.configService.get('API_KEY');
  }

  private async downloadFile(
    url: string,
    uploadDir: string,
    filename: string,
  ): Promise<string | null> {
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      const filePath = path.join(process.cwd(), uploadDir, filename);
      const response$ = this.httpService.get(url, {
        responseType: 'arraybuffer',
      });
      const { data } = await lastValueFrom(response$);
      await fs.writeFile(filePath, data);
      return filePath;
    } catch (error) {
      console.error(`Error downloading file from ${url}:`, error);
      return null;
    }
  }

  async searchAndDownloadVideos(query: string, perPage = 3): Promise<string[]> {
    const url = `${this.BASE_URL}/videos/`;
    const response$ = this.httpService.get(url, {
      params: {
        key: this.API_KEY,
        q: query,
        per_page: perPage,
      },
    });
    const { data } = await lastValueFrom(response$);
    if (!data?.hits?.length) return [];

    const uploadDir = 'uploads/videos';
    const downloadedPaths: string[] = [];
    for (const hit of data.hits) {
      const videoUrl = hit.videos.large?.url || hit.videos.medium?.url;
      if (videoUrl) {
        const filename = `video_${uuidv4()}.mp4`;
        const filePath = await this.downloadFile(videoUrl, uploadDir, filename);
        if (filePath) downloadedPaths.push(filePath);
      }
    }
    return downloadedPaths;
  }

  async searchAndDownloadImages(query: string, perPage = 3): Promise<string[]> {
    const response$ = this.httpService.get(this.BASE_URL, {
      params: {
        key: this.API_KEY,
        q: query,
        per_page: perPage,
        image_type: 'photo',
      },
    });
    const { data } = await lastValueFrom(response$);
    if (!data?.hits?.length) return [];

    const uploadDir = 'uploads/images';
    const downloadedPaths: string[] = [];
    for (const hit of data.hits) {
      const imageUrl = hit.largeImageURL;
      if (imageUrl) {
        const filename = `image_${uuidv4()}.jpg`;
        const filePath = await this.downloadFile(imageUrl, uploadDir, filename);
        if (filePath) downloadedPaths.push(filePath);
      }
    }
    return downloadedPaths;
  }

  async searchAndDownloadIllustrations(
    query: string,
    perPage = 3,
  ): Promise<string[]> {
    const response$ = this.httpService.get(this.BASE_URL, {
      params: {
        key: this.API_KEY,
        q: query,
        per_page: perPage,
        image_type: 'vector',
        safesearch: true,
      },
    });
    const { data } = await lastValueFrom(response$);
    if (!data?.hits?.length) return [];

    const uploadDir = 'uploads/illustrations';
    const downloadedPaths: string[] = [];
    for (const hit of data.hits) {
      const illustrationUrl = hit.largeImageURL;
      if (illustrationUrl) {
        const filename = `illustration_${uuidv4()}.jpg`;
        const filePath = await this.downloadFile(
          illustrationUrl,
          uploadDir,
          filename,
        );
        if (filePath) downloadedPaths.push(filePath);
      }
    }
    return downloadedPaths;
  }

  async searchAndDownloadMusic(query: string, perPage = 3): Promise<string[]> {
    const response$ = this.httpService.get(`${this.BASE_URL}/music/`, {
      params: {
        key: this.API_KEY,
        q: query,
        per_page: perPage,
      },
    });
    const { data } = await lastValueFrom(response$);
    if (!data?.hits?.length) return [];

    const uploadDir = 'uploads/music';
    const downloadedPaths: string[] = [];
    for (const hit of data.hits) {
      const musicUrl = hit.audio;
      if (musicUrl) {
        const filename = `music_${uuidv4()}.mp3`;
        const filePath = await this.downloadFile(musicUrl, uploadDir, filename);
        if (filePath) downloadedPaths.push(filePath);
      }
    }
    return downloadedPaths;
  }
}
*/

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { Readable } from "stream";
import { lastValueFrom } from "rxjs";
import { v4 as uuidv4 } from "uuid";
import { Job } from "src/types/jobTypes";
import { GridFSBucket } from "mongodb";
import { StorageService } from "../storage/storage.service";

@Injectable()
export class PixabayService {
  private readonly logger = new Logger(PixabayService.name);
  private readonly API_KEY: string | undefined;
  private readonly BASE_URL = "https://pixabay.com/api";

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly storageService: StorageService,
  ) {
    this.API_KEY = this.configService.get("PIXABAY_API_KEY");
    if (!this.API_KEY) {
      this.logger.error("Pixabay API key is missing");
      throw new Error("Pixabay API key is not configured");
    }
  }

  private async fetchStream(url: string): Promise<Readable | null> {
    try {
      const response = await lastValueFrom(
        this.httpService.get(url, { responseType: "stream" }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error fetching stream from ${url}: ${error.message}`);
      return null;
    }
  }

  async searchAndDownloadVideoStreams(
    query: string,
    perPage = 3,
  ): Promise<Readable[]> {
    this.logger.log(`Searching for videos with query: ${query}`);
    const url = `${this.BASE_URL}/videos/`;
    try {
      const response = await lastValueFrom(
        this.httpService.get(url, {
          params: {
            key: this.API_KEY,
            q: query,
            per_page: perPage,
          },
        }),
      );
      const hits = response.data?.hits || [];
      if (!hits.length) {
        this.logger.warn(`No videos found for query: ${query}`);
        return [];
      }

      const streams: Readable[] = [];
      for (const hit of hits) {
        const videoUrl = hit.videos?.large?.url || hit.videos?.medium?.url;
        if (videoUrl) {
          const stream = await this.fetchStream(videoUrl);
          if (stream) {
            stream["filename"] = `video_${uuidv4()}.mp4`; // Attach filename for GridFS
            streams.push(stream);
          }
        }
      }
      this.logger.log(
        `Fetched ${streams.length} video streams for query: ${query}`,
      );
      return streams;
    } catch (error) {
      this.logger.error(
        `Error searching videos for query ${query}: ${error.message}`,
      );
      throw new Error(`Failed to fetch video streams: ${error.message}`);
    }
  }

  async searchAndDownloadImageStreams(
    query: string,
    perPage = 3,
  ): Promise<Readable[]> {
    this.logger.log(`Searching for images with query: ${query}`);
    try {
      const response = await lastValueFrom(
        this.httpService.get(this.BASE_URL, {
          params: {
            key: this.API_KEY,
            q: query,
            per_page: perPage,
            image_type: "photo",
          },
        }),
      );
      const hits = response.data?.hits || [];
      if (!hits.length) {
        this.logger.warn(`No images found for query: ${query}`);
        return [];
      }

      const streams: Readable[] = [];
      for (const hit of hits) {
        const imageUrl = hit.largeImageURL;
        if (imageUrl) {
          const stream = await this.fetchStream(imageUrl);
          if (stream) {
            stream["filename"] = `image_${uuidv4()}.jpg`; // Attach filename for GridFS
            streams.push(stream);
          }
        }
      }
      this.logger.log(
        `Fetched ${streams.length} image streams for query: ${query}`,
      );
      return streams;
    } catch (error) {
      this.logger.error(
        `Error searching images for query ${query}: ${error.message}`,
      );
      throw new Error(`Failed to fetch image streams: ${error.message}`);
    }
  }

  async searchAndDownloadIllustrationStreams(
    query: string,
    perPage = 3,
  ): Promise<Readable[]> {
    this.logger.log(`Searching for illustrations with query: ${query}`);
    try {
      const response = await lastValueFrom(
        this.httpService.get(this.BASE_URL, {
          params: {
            key: this.API_KEY,
            q: query,
            per_page: perPage,
            image_type: "vector",
            safesearch: true,
          },
        }),
      );
      const hits = response.data?.hits || [];
      if (!hits.length) {
        this.logger.warn(`No illustrations found for query: ${query}`);
        return [];
      }

      const streams: Readable[] = [];
      for (const hit of hits) {
        const illustrationUrl = hit.largeImageURL;
        if (illustrationUrl) {
          const stream = await this.fetchStream(illustrationUrl);
          if (stream) {
            stream["filename"] = `illustration_${uuidv4()}.jpg`; // Attach filename for GridFS
            streams.push(stream);
          }
        }
      }
      this.logger.log(
        `Fetched ${streams.length} illustration streams for query: ${query}`,
      );
      return streams;
    } catch (error) {
      this.logger.error(
        `Error searching illustrations for query ${query}: ${error.message}`,
      );
      throw new Error(`Failed to fetch illustration streams: ${error.message}`);
    }
  }

  async searchAndDownloadMusicStream(
    query: string,
    perPage = 3,
  ): Promise<Readable | null> {
    this.logger.log(`Searching for music with query: ${query}`);
    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.BASE_URL}/music/`, {
          params: {
            key: this.API_KEY,
            q: query,
            per_page: perPage,
          },
        }),
      );
      const hits = response.data?.hits || [];
      if (!hits.length) {
        this.logger.warn(`No music found for query: ${query}`);
        return null;
      }

      const musicUrl = hits[0].audio;
      if (musicUrl) {
        const stream = await this.fetchStream(musicUrl);
        if (stream) {
          stream["filename"] = `music_${uuidv4()}.mp3`; // Attach filename for GridFS
          this.logger.log(`Fetched music stream for query: ${query}`);
          return stream;
        }
      }
      this.logger.warn(`No valid music stream found for query: ${query}`);
      return null;
    } catch (error) {
      this.logger.error(
        `Error searching music for query ${query}: ${error.message}`,
      );
      throw new Error(`Failed to fetch music stream: ${error.message}`);
    }
  }

  /**
   * Searches for video clips based on the query and stores them in GridFS.
   * @param job The current job object.
   * @param bucket The GridFSBucket instance.
   * @param videoSearchQuery The query for video search.
   * @returns A promise that resolves to an array of stored video clip IDs.
   */
  async searchAndStoreVideoClips(
    job: Job,
    bucket: GridFSBucket,
    videoSearchQuery: string,
  ): Promise<string[]> {
    const videoStreams =
      await this.searchAndDownloadVideoStreams(videoSearchQuery);
    return Promise.all(
      videoStreams.map((stream, i) =>
        this.storageService.storeStream(
          bucket,
          stream,
          `video_${job._id.toString()}_${i}.mp4`,
        ),
      ),
    );
  }
}
