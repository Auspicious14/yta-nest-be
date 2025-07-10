/*import { EdgeTTS } from '@andresaya/edge-tts';
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
*/


import { Injectable, Logger } from '@nestjs/common';
import { EdgeTTS } from '@andresaya/edge-tts';
import { PassThrough, Readable } from 'stream';
import ffmpeg from 'fluent-ffmpeg';

@Injectable()
export class TTSService {
  private readonly logger = new Logger(TTSService.name);

  constructor(private readonly tts: EdgeTTS) {}

  async synthesizeStream(text: string, filename: string, voice: string = 'en-US-AriaNeural'): Promise<Readable> {
    this.logger.log(`Generating audio stream for text: ${text.slice(0, 50)}...`);

    try {
      // Generate audio using EdgeTTS
      await this.tts.synthesize(text, voice, {
        rate: '0%',
        pitch: '0Hz',
        volume: '0%',
      });

      const audioBuffer = this.tts.toRaw();
      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error('Empty audio buffer generated');
      }

      // Convert buffer to stream
      let audioStream = Readable.from(audioBuffer);

      // Preprocess to 16kHz mono WAV for VOSK compatibility
      audioStream = await this.preprocessAudio(audioStream);

      // Attach filename for GridFS storage
      audioStream['filename'] = filename || `audio_${Date.now()}.wav`;

      this.logger.log(`Audio stream generated successfully for: ${audioStream['filename']}`);
      return audioStream;
    } catch (error) {
      this.logger.error(`Audio generation failed: ${error.message}`);
      throw new Error(`Failed to generate audio stream: ${error.message}`);
    }
  }

  private async preprocessAudio(inputStream: Readable): Promise<Readable> {
    return new Promise((resolve, reject) => {
      const outputStream = new PassThrough();
      ffmpeg(inputStream)
        .audioFrequency(16000)
        .audioChannels(1)
        .format('wav')
        .on('error', (err) => {
          this.logger.error(`Audio preprocessing failed: ${err.message}`);
          reject(err);
        })
        .on('end', () => {
          this.logger.log('Audio preprocessing completed');
          resolve(outputStream);
        })
        .pipe(outputStream, { end: true });
    });
  }
}
