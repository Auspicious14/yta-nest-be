import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model } from 'mongoose';
import { JobStatus } from '../types/jobTypes';


@Schema()
export class VideoDetails {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], required: true })
  tags: string[];

  @Prop({ type: String, default: null }) // GridFS ID for thumbnail
  thumbnailId: string;
}

@Schema({ timestamps: true })
export class Job {
  @Prop({ required: true })
  prompt: string;

  @Prop({ enum: Object.values(JobStatus), default: JobStatus.PENDING })
  status: JobStatus;

  @Prop({ required: false })
  script: string;

  @Prop({ type: String, default: null }) // GridFS ID for audio
  audioId: string;

  @Prop({ type: String, default: null }) // GridFS ID for subtitles
  subtitleId: string;

  @Prop({ type: [String], default: [] }) // GridFS IDs for video clips
  videoClipIds: string[];

  @Prop({ type: String, default: null }) // GridFS ID for background music
  backgroundMusicId: string;

  @Prop({ type: String, default: null }) // GridFS ID for final video
  finalVideoId: string;

  @Prop({ type: String, default: null }) // YouTube video ID
  youtubeVideoId: string;

  @Prop({ type: String, default: null }) // YouTube video URL
  youtubeVideoUrl: string;

  @Prop({ type: String, default: null }) // Error message for failed jobs
  errorMessage: string;

  @Prop({ type: Date, default: null }) // Start time of job processing
  startTime: Date;

  @Prop({ type: Date, default: null }) // End time of job processing
  endTime: Date;

  @Prop({ type: VideoDetails, required: false }) // Video metadata
  videoDetails: VideoDetails;
}

export const JobSchema = SchemaFactory.createForClass(Job);
export type JobDocument = Job & Document;
export const JobModel: Model<JobDocument> = JobSchema as any;
