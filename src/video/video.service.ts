import { Injectable } from "@nestjs/common";
import { google } from "googleapis";


@Injectable()
export class VideoService {
  private youtube = google.youtube('v3');
  private oauth2Client: any;
  private CLIENT_ID: string | undefined;
  private CLIENT_SECRET: string | undefined;
  private REDIRECT_URI: string;
  private REFRESH_TOKEN: string | undefined;

  constructor() {
    this.CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
    this.CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
    this.REDIRECT_URI =
      process.env.YOUTUBE_REDIRECT_URI ||
      'http://localhost:3000/oauth2callback';

    this.oauth2Client = new google.auth.OAuth2(
      this.CLIENT_ID,
      this.CLIENT_SECRET,
      this.REDIRECT_URI,
    );

    this.REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;

    if (this.REFRESH_TOKEN) {
      this.oauth2Client.setCredentials({
        refresh_token: this.REFRESH_TOKEN,
      });
    }
  }

  public async uploadVideo(
    videoFilePath: string,
    title: string,
    description: string,
    tags: string[],
  ): Promise<any> {
    if (!this.REFRESH_TOKEN) {
      console.error('YouTube refresh token not set. Cannot upload video.');
      console.log(
        'Please ensure YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI, and YOUTUBE_REFRESH_TOKEN are set in your .env file.',
      );
      console.log(
        'You might need to perform an OAuth flow to get a refresh token.',
      );
      return null;
    }

    try {
      const response = this.youtube.videos.insert(
        {
          auth: this.oauth2Client,
          part: ['snippet', 'status'],
          requestBody: {
            snippet: {
              title,
              description,
              tags,
              categoryId: '28', // Science & Technology
              defaultLanguage: 'en',
              localized: {
                en: {
                  title,
                  description,
                },
              },
            },
            status: {
              privacyStatus: 'private', // or 'public', 'unlisted'
            },
          },
          media: {
            body: await import('fs').then((fs) =>
              fs.createReadStream(videoFilePath),
            ),
          },
        },
        {
          // This is important for handling large file uploads
          onUploadProgress: (evt: {
            bytesRead: number;
            res: { headers: { [x: string]: any } };
          }) => {
            const progress =
              (evt.bytesRead / (evt.res?.headers['content-length'] || 1)) * 100;
            console.log(`Upload progress: ${progress.toFixed(2)}%`);
          },
        },
      );

      console.log('Video uploaded. ID:', response.data.id);
      return response.data;
    } catch (error: any) {
      console.error('Error uploading video to YouTube:', error);
      // More detailed error logging for YouTube API errors
      if (error.response) {
        console.error('YouTube API Error Response Data:', error.response.data);
      }
      return null;
    }
  }

  public async getOAuthConsentUrl(): Promise<string> {
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ];

    const url = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });
    return url;
  }

  public async getTokensAndSetCredentials(code: string): Promise<any> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      console.log('Tokens received:', tokens);
      return tokens;
    } catch (error) {
      console.error('Error getting tokens:', error);
      return null;
    }
  }
}
