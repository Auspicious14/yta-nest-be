import { Logger } from "@nestjs/common";
import { GridFSBucket } from "mongodb";
import { Readable } from "stream";

export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  constructor() {}

  /**
   * Stores a readable stream into GridFS.
   * @param bucket The GridFSBucket instance.
   * @param stream The readable stream to store.
   * @param filename The desired filename for the stored stream.
   * @returns A promise that resolves with the ID of the stored file.
   */
  async storeStream(
    bucket: GridFSBucket,
    stream: Readable,
    filename: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(filename);
      stream
        .pipe(uploadStream)
        .on("finish", () => resolve(uploadStream.id.toString()))
        .on("error", (err) => {
          this.logger.error(
            `Failed to store stream ${filename}: ${err.message}`,
          );
          reject(err);
        });
    });
  }

  /**
   * Converts a readable stream into a Buffer.
   * @param stream The readable stream to convert.
   * @returns A promise that resolves with the concatenated Buffer of the stream's data.
   */
  async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream
        .on("data", (chunk) => chunks.push(Buffer.from(chunk)))
        .on("end", () => resolve(Buffer.concat(chunks)))
        .on("error", (err) => reject(err));
    });
  }
}
