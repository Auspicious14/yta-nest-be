import { HttpService } from '@nestjs/axios';
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
