/* import { Injectable } from "@nestjs/common";
import { google } from "googleapis";
import { ConfigService } from '@nestjs/config';


@Injectable()
export class YoutubeService {
  private youtube = google.youtube('v3');
  private oauth2Client: any;
  private CLIENT_ID: string | undefined;
  private CLIENT_SECRET: string | undefined;
  private REDIRECT_URI: string;
  private REFRESH_TOKEN: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.CLIENT_ID = this.configService.get<string>('YOUTUBE_CLIENT_ID');
    this.CLIENT_SECRET = this.configService.get<string>('YOUTUBE_CLIENT_SECRET');
    this.REDIRECT_URI =
      this.configService.get<string>('YOUTUBE_REDIRECT_URI') ||
      'http://localhost:23000/oauth2callback';

    this.oauth2Client = new google.auth.OAuth2(
      this.CLIENT_ID,
      this.CLIENT_SECRET,
      this.REDIRECT_URI,
    );

    this.REFRESH_TOKEN = this.configService.get<string>('YOUTUBE_REFRESH_TOKEN');

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
        'Please ensure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and YOUTUBE_REFRESH_TOKEN are set in your .env file.',
      );
      console.log(
        'You might need to perform an OAuth flow to get a refresh token.',
      );
      return null;
    }

    try {
      const response: any = await this.youtube.videos.insert(
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
                title,
                description,
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
*/


import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { GridFSBucket } from 'mongoose';

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);
  private readonly youtube = google.youtube('v3');
  private readonly oauth2Client: any;
  private readonly CLIENT_ID: string | undefined;
  private readonly CLIENT_SECRET: string | undefined;
  private readonly REDIRECT_URI: string;
  private readonly REFRESH_TOKEN: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.CLIENT_ID = this.configService.get<string>('YOUTUBE_CLIENT_ID');
    this.CLIENT_SECRET = this.configService.get<string>('YOUTUBE_CLIENT_SECRET');
    this.REDIRECT_URI =
      this.configService.get<string>('YOUTUBE_REDIRECT_URI') ||
      'http://localhost:23000/oauth2callback';

    if (!this.CLIENT_ID || !this.CLIENT_SECRET) {
      this.logger.error('YouTube CLIENT_ID or CLIENT_SECRET missing');
      throw new Error('YouTube API credentials not configured');
    }

    this.oauth2Client = new google.auth.OAuth2(
      this.CLIENT_ID,
      this.CLIENT_SECRET,
      this.REDIRECT_URI
    );

    this.REFRESH_TOKEN = this.configService.get<string>('YOUTUBE_REFRESH_TOKEN');
    if (this.REFRESH_TOKEN) {
      this.oauth2Client.setCredentials({
        refresh_token: this.REFRESH_TOKEN,
      });
    } else {
      this.logger.warn('YouTube REFRESH_TOKEN not set. OAuth flow required.');
    }
  }

  async uploadVideoStream(
    videoStream: Readable,
    title: string,
    description: string,
    tags: string[],
    bucket?: GridFSBucket,
    finalVideoId?: string
  ): Promise<{ id: string; url: string } | null> {
    if (!this.REFRESH_TOKEN) {
      this.logger.error('YouTube refresh token not set. Cannot upload video.');
      this.logger.log(
        'Ensure YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI, and YOUTUBE_REFRESH_TOKEN are set in .env.'
      );
      this.logger.log('Perform OAuth flow to obtain a refresh token.');
      throw new Error('YouTube refresh token missing');
    }

    try {
      // If finalVideoId is provided, fetch stream from GridFS
      let uploadStream = videoStream;
      if (finalVideoId && bucket) {
        this.logger.log(`Fetching video stream from GridFS: ${finalVideoId}`);
        uploadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(finalVideoId));
      }

      // Validate inputs
      if (!uploadStream) {
        throw new Error('No video stream provided');
      }
      const cleanTitle = title.slice(0, 100); // YouTube title limit
      const cleanDescription = description.slice(0, 5000); // YouTube description limit
      const cleanTags = tags.slice(0, 500); // YouTube tag limit (total length)

      this.logger.log(`Uploading video to YouTube: ${cleanTitle}`);

      const response = await this.youtube.videos.insert(
        {
          auth: this.oauth2Client,
          part: ['snippet', 'status'],
          requestBody: {
            snippet: {
              title: cleanTitle,
              description: cleanDescription,
              tags: cleanTags,
              categoryId: '28', // Science & Technology
              defaultLanguage: 'en',
              defaultAudioLanguage: 'en',
              localized: {
                title: cleanTitle,
                description: cleanDescription,
              },
            },
            status: {
              privacyStatus: 'private', // or 'public', 'unlisted'
              selfDeclaredMadeForKids: false,
            },
          },
          media: {
            body: uploadStream,
          },
        },
        {
          onUploadProgress: (evt: { bytesRead: number; res?: { headers: { [x: string]: any } } }) => {
            const contentLength = evt.res?.headers['content-length'] || 1;
            const progress = (evt.bytesRead / contentLength) * 100;
            this.logger.log(`Upload progress: ${progress.toFixed(2)}%`);
          },
        }
      );

      const videoId = response.data.id;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      this.logger.log(`Video uploaded successfully. ID: ${videoId}, URL: ${videoUrl}`);
      return { id: videoId, url: videoUrl };
    } catch (error: any) {
      this.logger.error('Error uploading video to YouTube:', error.message);
      if (error.response) {
        this.logger.error('YouTube API Error Response:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`Failed to upload video: ${error.message}`);
    }
  }

  async getOAuthConsentUrl(): Promise<string> {
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ];

    const url = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Ensure refresh token is returned
    });
    this.logger.log('Generated OAuth consent URL');
    return url;
  }

  async getTokensAndSetCredentials(code: string): Promise<any> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      this.logger.log('OAuth tokens received and set');
      return tokens;
    } catch (error: any) {
      this.logger.error(`Error getting OAuth tokens: ${error.message}`);
      throw new Error(`Failed to get OAuth tokens: ${error.message}`);
    }
  }
}
