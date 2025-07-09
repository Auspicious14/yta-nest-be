import { ObjectId } from 'mongoose';

export interface Job {
  _id: ObjectId;
  prompt: string;
  script: string;
  videoDetails: {
    title: string;
    description: string;
    tags: string[];
    thumbnailId: string;
  };
  audioId: string;
  videoClipIds: string[];
  backgroundMusicId: string | null;
  subtitleId: string;
  finalVideoId: string;
  youtubeVideoId: string;
  youtubeVideoUrl: string;
}
