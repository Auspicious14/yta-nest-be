import { Injectable } from '@nestjs/common';
import * as path from 'path';

@Injectable()
export class SpeechService {
  private whisperTranscribe = require('./engines/whisper');
  private voskTranscribe = require('./engines/vosk');

  async transcribe(
    engine: 'whisper' | 'vosk',
    filePath: string,
  ): Promise<string> {
    const absPath = path.resolve(filePath);

    switch (engine) {
      case 'whisper':
        return await this.whisperTranscribe(absPath);
      case 'vosk':
        return await this.voskTranscribe(absPath);
      default:
        throw new Error(`Unsupported engine: ${engine}`);
    }
  }
}
