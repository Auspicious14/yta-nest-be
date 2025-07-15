import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { Connection } from 'mongoose';
import { Db, GridFSBucket, ObjectId } from 'mongodb';
import { Readable } from 'stream';
import { InjectConnection } from '@nestjs/mongoose';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private bucket: GridFSBucket;

  constructor(@InjectConnection() private readonly connection: Connection) {
    this.bucket = new GridFSBucket(this.connection.db as Db);
  }

  /**
   * Stores a readable stream into GridFS.
   * @param stream The readable stream to store.
   * @param filename The desired filename for the stored stream.
   * @returns A promise that resolves with the ID of the stored file.
   */
  async storeStream(
    stream: Readable,
    filename: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.bucket.openUploadStream(filename);
      stream
        .pipe(uploadStream)
        .on('finish', () => resolve(uploadStream.id.toString()))
        .on('error', (err) => {
          this.logger.error(
            `Failed to store stream ${filename}: ${err.message}`,
          );
          reject(new InternalServerErrorException(`Failed to store stream ${filename}: ${err.message}`));
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
        .on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', (err) => reject(new InternalServerErrorException(`Failed to convert stream to buffer: ${err.message}`)));
    });
  }

  /**
   * Opens a download stream for a file from GridFS.
   * @param fileId The ID of the file to download.
   * @returns A readable stream of the file's content.
   */
  openDownloadStream(fileId: string): Readable {
    return this.bucket.openDownloadStream(new ObjectId(fileId));
  }
  /**
   * Deletes a file from GridFS.
   * @param fileId The ID of the file to delete.
   */
  async deleteFile(fileId: string): Promise<void> {
    const bucket = new GridFSBucket(this.connection.db as Db);
    await bucket.delete(new ObjectId(fileId));
  }
}
