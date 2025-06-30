import { Document } from 'mongoose';

export enum JobStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface IJob extends Document {
  prompt: string;
  status: JobStatus;
  script: string;
  audioFilePath: string;
  subtitleFilePath: string;
  videoFilePath: string;
  videoDetails: {
    title: string;
    description: string;
    tags: string[];
    thumbnailPath: string;
  };
  createdAt: Date;
  updatedAt: Date;
  startTime: Date
  endTime: Date
}