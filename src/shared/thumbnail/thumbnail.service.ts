import { Injectable, Logger } from '@nestjs/common';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Readable } from 'stream';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ThumbNailService {
  private readonly logger = new Logger(ThumbNailService.name);

  constructor() {}

  async generateStream(prompt: string, filename?: string): Promise<Readable> {
    this.logger.log(`Generating thumbnail stream for prompt: ${prompt}`);

    try {
      const width = 1280;
      const height = 720;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Load background image (or use color fill)
      let bgImage;
      try {
        bgImage = await loadImage(path.join(__dirname, 'assets', 'default-bg.jpg'));
      } catch (error) {
        this.logger.warn(`Failed to load default background image: ${error.message}`);
        // Fallback to solid color if image fails
        ctx.fillStyle = '#333333'; // Dark gray fallback
        ctx.fillRect(0, 0, width, height);
      }

      if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, width, height);
      }

      // Text styles
      ctx.font = 'bold 60px Sans';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 10;

      // Draw prompt/title (truncate if too long)
      const maxTextLength = 50;
      const displayText = prompt.length > maxTextLength ? `${prompt.slice(0, maxTextLength - 3)}...` : prompt;
      ctx.fillText(displayText, width / 2, height / 2);

      // Generate buffer and convert to stream
      const buffer = canvas.toBuffer('image/png');
      const stream = Readable.from(buffer);

      // Attach filename for GridFS storage
      stream['filename'] = filename || `thumbnail_${uuidv4()}.png`;

      this.logger.log(`Thumbnail stream generated successfully for: ${stream['filename']}`);
      return stream;
    } catch (error) {
      this.logger.error(`Thumbnail generation failed: ${error.message}`);
      throw new Error(`Failed to generate thumbnail stream: ${error.message}`);
    }
  }
}
