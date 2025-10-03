import { Module } from "@nestjs/common";
import { TTSService } from "./tts.service";
import { EdgeTTS } from "@andresaya/edge-tts";
import { StorageModule } from "../storage/storage.module";
import { UtilityModule } from "../utility/utility.module";

@Module({
  imports: [StorageModule, UtilityModule],
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