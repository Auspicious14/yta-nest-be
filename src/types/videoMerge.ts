/*export interface VideoMergeOptions {
  clips: string[]; // paths to .mp4 clips
  audioPath: string; // main voiceover or TTS
  musicPath?: string; // optional background music
  subtitlePath?: string; // .srt subtitle file
  thumbnailPath?: string; // for intro or preview frame
  outputPath: string; // final output path
}
*/

import { Readable } from 'stream';
import { GridFSBucket } from 'mongoose';

export interface VideoMergeOptions {
  clipStreams: Readable[]; // Video clip streams from PixabayService
  audioStream: Readable; // Audio stream from TTSService
  musicStream: Readable | null; // Music stream from PixabayService
  subtitleId: string; // GridFS ID for subtitle file
  thumbnailId: string; // GridFS ID for thumbnail
  bucket: GridFSBucket; // GridFS bucket for accessing subtitles/thumbnail
}
