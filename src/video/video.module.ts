import { Module } from "@nestjs/common";
import { YoutubeService } from "./video.service";
import { VideoController } from "./video.controller";


@Module({
  controllers: [VideoController],
  providers: [YoutubeService],
  exports: [YoutubeService],
})
export class VideoModule {}
