export interface VideoMergeOptions {
  clips: string[]; // paths to .mp4 clips
  audioPath: string; // main voiceover or TTS
  musicPath?: string; // optional background music
  subtitlePath?: string; // .srt subtitle file
  thumbnailPath?: string; // for intro or preview frame
  outputPath: string; // final output path
}
