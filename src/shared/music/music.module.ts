import { Module } from "@nestjs/common";
import { MusicService } from "./music.service";
import { HttpModule } from "@nestjs/axios";

@Module({
  imports: [HttpModule],
  providers: [MusicService],
  exports: [MusicService],
})
export class MusicModule {}
