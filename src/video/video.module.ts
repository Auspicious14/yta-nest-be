import { Module } from "@nestjs/common";
import { VideoService } from "./video.service";
import { VideoController } from "./video.controller";


@Module({
    controllers: [VideoController],
    providers: [VideoService],
    exports: [VideoService]
}) 

export class VideoModule {}
