import { Injectable, Logger } from '@nestjs/common'; 
import { EdgeTTS } from '@andresaya/edge-tts';
import { PassThrough, Readable } from 'stream';
import * as ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs/promises';

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
      const processedAudioStream = await this.preprocessAudio(audioStream);

      // Attach filename for GridFS storage
      processedAudioStream['filename'] = filename || `audio_${Date.now()}.wav`;

      this.logger.log(`Audio stream generated successfully for: ${processedAudioStream['filename']}`);
       return processedAudioStream;
    } catch (error) {
      this.logger.error(`Audio generation failed: ${error.message}`);
      throw new Error(`Failed to generate audio stream: ${error.message}`);
    }
  }

  private async preprocessAudio(inputStream: Readable): Promise<Readable> {
    return new Promise((resolve, reject) => {
      const outputStream = new PassThrough();
      
      // Ensure the input stream is not already ended
      if (inputStream.readableEnded) {
        reject(new Error('Input stream has already ended'));
        return;
      }
      
      ffmpeg()
        .input(inputStream)
        .inputOptions([
          '-f s16le', // Signed 16-bit little-endian PCM
          '-ar 24000', // Audio sample rate (common for EdgeTTS output)
          '-ac 1'      // Audio channels (EdgeTTS is typically mono)
        ])
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
