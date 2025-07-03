import { Module } from "@nestjs/common";
import { TTSService } from "./tts.service";
import { EdgeTTS } from "@andresaya/edge-tts";

@Module({
  providers: [
    {
      provide: EdgeTTS,
      useFactory: () => new EdgeTTS(),
    },
    TTSService,
  ],
  exports: [TTSService],
})
export class TTSModule {}