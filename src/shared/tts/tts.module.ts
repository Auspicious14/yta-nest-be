import { Module } from "@nestjs/common";
import { TTSService } from "./tts.service";


@Module({
    imports: [],
    controllers: [],
    providers: [TTSService]
})

export class TTSModule {}