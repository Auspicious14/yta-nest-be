import { Module } from "@nestjs/common";
import { TTSService } from "./tts.service";


@Module({
    providers: [TTSService],
    exports: [TTSService],
})

export class TTSModule {}