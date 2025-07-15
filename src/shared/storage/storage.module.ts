import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}