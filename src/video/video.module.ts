import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { VideoController } from "./video.controller";
import { Job, JobSchema } from "src/schemas";
import { YoutubeService } from "./video.service";
import { HttpModule, HttpService } from "@nestjs/axios";


@Module({
  imports: [
    MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }]),
    // ...other modules...
    HttpModule,
  ],
  controllers: [VideoController],
  providers: [YoutubeService],
  exports: [YoutubeService],
})
export class VideoModule {}
