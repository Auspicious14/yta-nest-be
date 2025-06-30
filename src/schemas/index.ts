

import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { IJob, JobStatus } from '../types/jobTypes';



@Schema({ timestamps: true })
  
export class Job  {
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
  videoDetails: {
    title: string;
    description: string;
    tags: string[];
    thumbnailPath: string;
  };

  @Prop({ required: false })
  createdAt: Date;

  @Prop({ required: false })
  updatedAt: Date;
}

export const JobSchema = SchemaFactory.createForClass(Job);