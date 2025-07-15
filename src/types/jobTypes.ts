import { ObjectId } from "mongoose";

export interface Job {
  _id: string;
  prompt: string;
  script: string | null;
  videoDetails: VideoDetails;
  audioId: string | null;
  videoClipIds: string[];
  backgroundMusicId: string | null;
  subtitleId: string | null;
  finalVideoId: string | null;
  youtubeVideoId: string | null;
  youtubeVideoUrl: string | null;
}

export enum JobStatus {
  PENDING = "PENDING",
  INPROGRESS = "INPROGRESS",
  FAILED = "FAILED",
  COMPLETED = "COMPLETED",
}

export interface VideoDetails {
  title: string;
  description: string;
  tags: string[];
  thumbnailId: string | null;
}
