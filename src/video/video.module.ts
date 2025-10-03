import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { VideoController } from "./video.controller";
import { Job, JobSchema } from "src/schemas";
import { YoutubeService } from "./video.service";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }]),
    HttpModule,
    ConfigModule,
  ],
  controllers: [VideoController],
  providers: [YoutubeService],
  exports: [YoutubeService],
})
export class VideoModule {}
