import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { Readable } from "stream";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { PixabayService } from "../pixabay/pixabay.service";

@Injectable()
export class ThumbNailService {
  private readonly logger = new Logger(ThumbNailService.name);

  constructor(private readonly pixabayService: PixabayService) {}

  async generateStream(prompt: string, filename?: string): Promise<Readable> {
    this.logger.log(`Generating thumbnail stream for prompt: ${prompt}`);

    try {
      const width = 1280;
      const height = 720;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      // Load background image (or use color fill)
      let bgImage;
      try {
        bgImage = await loadImage(
          path.join(__dirname, "assets", "default-bg.jpg"),
        );
      } catch (error) {
        this.logger.warn(
          `Failed to load default background image: ${error.message}`,
        );
        // Fallback to solid color if image fails
        ctx.fillStyle = "#333333"; // Dark gray fallback
        ctx.fillRect(0, 0, width, height);
      }

      if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, width, height);
      }

      // Text styles
      ctx.font = "bold 60px Sans";
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      ctx.shadowColor = "black";
      ctx.shadowBlur = 10;

      // Draw prompt/title (truncate if too long)
      const maxTextLength = 50;
      const displayText =
        prompt.length > maxTextLength
          ? `${prompt.slice(0, maxTextLength - 3)}...`
          : prompt;
      ctx.fillText(displayText, width / 2, height / 2);

      // Generate buffer and convert to stream
      const buffer = canvas.toBuffer("image/png");
      const stream = Readable.from(buffer);

      // Attach filename for GridFS storage
      stream["filename"] = filename || `thumbnail_${uuidv4()}.png`;

      this.logger.log(
        `Thumbnail stream generated successfully for: ${stream["filename"]}`,
      );
      return stream;
    } catch (error) {
      this.logger.error(`Thumbnail generation failed: ${error.message}`);
      throw new Error(`Failed to generate thumbnail stream: ${error.message}`);
    }
  }

  /**
   * Generates a thumbnail stream, with a fallback to Pixabay if generation fails.
   * @param script The script content for thumbnail generation.
   * @param imageSearchQuery The query to search for fallback images on Pixabay.
   * @param jobId The ID of the current job.
   * @returns A promise that resolves with a readable stream of the thumbnail image.
   */
  async generateThumbnailWithFallback(
    script: string,
    imageSearchQuery: string,
    jobId: string,
  ): Promise<Readable> {
    try {
      const thumbnailStream = await this.generateStream(
        script,
        `thumbnail_${jobId}.png`,
      );
      if (thumbnailStream) return thumbnailStream;
      this.logger.warn(
        "Thumbnail generation failed, using Pixabay fallback...",
      );
      const illustrationStreams =
        await this.pixabayService.searchAndDownloadIllustrationStreams(
          imageSearchQuery,
        );
      return illustrationStreams.length > 0
        ? illustrationStreams[0]
        : Readable.from([]);
    } catch (error) {
      this.logger.error(`Error in thumbnail generation: ${error.message}`);
      throw new InternalServerErrorException("Thumbnail generation failed");
    }
  }
}
