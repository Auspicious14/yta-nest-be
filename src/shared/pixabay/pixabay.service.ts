import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class PixabayService {
  private readonly API_KEY = process.env.PIXABAY_API_KEY;
  private readonly BASE_URL = 'https://pixabay.com/api';

  constructor(private readonly httpService: HttpService) {}

  async searchVideos(query: string, perPage = 3): Promise<string[]> {
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

    // Pick highest quality file (you can customize this)
    return data.hits.map(
      (hit) => hit.videos.large?.url || hit.videos.medium?.url,
    );
  }

  async searchImages(query: string, perPage = 3): Promise<string[]> {
    const response$ = this.httpService.get(this.BASE_URL, {
      params: {
        key: this.API_KEY,
        q: query,
        per_page: perPage,
        image_type: 'photo',
      },
    });

    const { data } = await lastValueFrom(response$);

    return data.hits.map((hit) => hit.largeImageURL);
  }

  async searchMusic(query: string, perPage = 3): Promise<string[]> {
    // Pixabay music API: https://pixabay.com/api/docs/music/
    const response$ = this.httpService.get(`${this.BASE_URL}/music/`, {
      params: {
        key: this.API_KEY,
        q: query,
        per_page: perPage,
      },
    });

    const { data } = await lastValueFrom(response$);

    return data.hits.map((hit) => hit.audio);
  }

  async searchIllustrations(query: string, perPage = 3): Promise<string[]> {
    const response$ = this.httpService.get(this.BASE_URL, {
      params: {
        key: this.API_KEY,
        q: query,
        per_page: perPage,
        image_type: 'vector', // 🖼️ This targets illustrations
        safesearch: true,
      },
    });

    const { data } = await lastValueFrom(response$);

    return data.hits.map((hit) => hit.largeImageURL);
  }
}
