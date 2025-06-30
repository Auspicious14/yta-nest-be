import { Module } from "@nestjs/common";
import { ThumbNailService } from "./thumbnail.service";

@Module({
    providers: [ThumbNailService],
    exports: [ThumbNailService]
})

export class ThumbNailModule {}