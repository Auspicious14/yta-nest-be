import { EdgeTTS } from '@andresaya/edge-tts';
import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';

@Injectable()
export class TTSService {
  constructor(private tts: EdgeTTS) {
    
  }

  async synthesize(
    text: string,
    filename: string,
    voice: string = 'en-US-AriaNeural',
  ) {
    const audioDir = path.join(process.cwd(), 'src', 'uploads', 'audio');
    // await fs.mkdir(audioDir, { recursive: true });
    const audioFilePath = path.join(audioDir, filename);

    await this.tts.synthesize(text, voice, {
      rate: '0%',
      pitch: '0Hz',
      volume: '0%',
    });

    const audioBuffer = this.tts.toRaw();
    await fs.writeFile(audioFilePath, audioBuffer);

    console.log(`Text converted to speech and saved to ${audioFilePath}`);
    return audioFilePath;
  }
}
