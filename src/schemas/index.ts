import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { IJob, JobStatus } from '../types/jobTypes';
import { Model } from 'mongoose';

class VideoDetails {
  @Prop()
  title: string;

  @Prop()
  description: string;

  @Prop({ type: [String] })
  tags: string[];

  @Prop()
  thumbnailPath: string;
}

@Schema({ timestamps: true })
export class Job {
  @Prop({ required: true })
  prompt: string;

  @Prop({ enum: Object.values(JobStatus), default: JobStatus.PENDING })
  status: JobStatus;

  @Prop({ required: false })
  script: string;

  @Prop({ required: false })
  audioFilePath: string;

  @Prop({ required: false })
  subtitleFilePath: string;

  @Prop({ type: [String] })
  videoClips?: string[];

  @Prop()
  finalVideoPath?: string;

  @Prop()
  title?: string;

  @Prop()
  description?: string;

  @Prop({ type: [String] })
  tags?: string[];

  @Prop()
  youtubeVideoId?: string;

  @Prop()
  youtubeVideoUrl?: string;

  @Prop()
  errorMessage?: string;

  @Prop()
  startTime: Date;

  @Prop()
  endTime: Date;

  @Prop()
  videoFilePath: string;

  @Prop()
  backgroundMusicPath: string;

  @Prop({ type: VideoDetails })
  videoDetails: VideoDetails;

  @Prop({ required: false })
  createdAt: Date;

  @Prop({ required: false })
  updatedAt: Date;
}

export const JobSchema = SchemaFactory.createForClass(Job);

export type JobDocument = Job & Document;
export const JobModel: Model<JobDocument> = JobSchema as any;