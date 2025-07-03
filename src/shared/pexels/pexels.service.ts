import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import path from 'path';
import { PexelsPhoto, PexelsVideo } from 'src/types/pexelsTypes';
import fs from 'fs/promises';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class PexelsService {
  private readonly PEXELS_API_URL ='https://api.pexels.com'
  private readonly PEXELS_API_KEY = '7976785'
  constructor(
    private readonly httpService: HttpService,
  ) {}

  async pexelInstance(pathUrl: string, query: string, perPage = 1) {
    if (!this.PEXELS_API_KEY) {
      console.error('PEXELS_API_KEY is not set in .env file');
      return [];
    }

    try {
      const res = this.httpService.get(`${this.PEXELS_API_URL}/${pathUrl}`, {
        headers: {
          Authorization: this.PEXELS_API_KEY,
        },
        params: {
          query,
          per_page: perPage,
        },
      });
      const response = await lastValueFrom(res);
      return response.data;
    } catch (error) {
      console.error('Error searching Pexels photos:', error);
      throw new InternalServerErrorException('Failed to fetch from Pexels');
    }
  }

  async searchPexelsPhotos(
    query: string,
    perPage: number = 1,
  ): Promise<PexelsPhoto[]> {
    const response = await this.pexelInstance('v1/search', query, perPage);
    return response?.photos;
  }

  async searchPexelsVideos(
    query: string,
    perPage: number = 1,
  ): Promise<PexelsVideo[]> {
    if (!this.PEXELS_API_KEY) {
      console.error('PEXELS_API_KEY is not set in .env file');
      return [];
    }

    const response = await this.pexelInstance('videos/search', query, perPage);
    return response.videos;
  }

  async downloadPexelsMedia(
    url: string,
    type: 'photo' | 'video',
    filename: string,
  ): Promise<string | null> {
    try {
      const uploadDir =
        type === 'photo' ? 'uploads/thumbnails' : 'uploads/videos';
      const filePath = path.join(process.cwd(), uploadDir, filename);

      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'arraybuffer',
      });

      await fs.writeFile(filePath, response.data);
      console.log(`Downloaded ${type} to ${filePath}`);
      return filePath;
    } catch (error) {
      console.error(`Error downloading ${type}:`, error);
      return null;
    }
  }
}
