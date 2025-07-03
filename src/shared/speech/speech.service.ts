import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';

@Injectable()
export class SpeechService {
  private whisperTranscribe = require('./engines/whisper');
  private voskTranscribe = require('./engines/vosk');

  async transcribe(
    engine: 'whisper' | 'vosk',
    filePath: string,
    jobId?: string, 
  ): Promise<string> {
    const absPath = path.resolve(filePath);

    let transcript: string;
    switch (engine) {
      case 'whisper':
        transcript = await this.whisperTranscribe(absPath);
        break;
      case 'vosk':
        transcript = await this.voskTranscribe(absPath);
        break;
      default:
        throw new Error(`Unsupported engine: ${engine}`);
    }

    // Save transcript to file
    const subtitlesDir = path.join(process.cwd(), 'uploads', 'subtitles');
    await fs.mkdir(subtitlesDir, { recursive: true });
    const filename = jobId
      ? `subtitle_${jobId}.txt`
      : `subtitle_${Date.now()}.txt`;
    const subtitleFilePath = path.join(subtitlesDir, filename);
    await fs.writeFile(subtitleFilePath, transcript);

    return subtitleFilePath;
  }
}
