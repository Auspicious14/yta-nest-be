import { Global, Module } from '@nestjs/common';
import { PexelsModule } from './pexels/pexels.module';
import { ScriptModule } from './script/script.module';
import { TTSModule } from './tts/tts.module';
import { ThumbNailModule } from './thumbnail/thumbnail.module';
import { PixabayModule } from './pixabay/pixabay.module';
import { SpeechModule } from './speech/speech.module';
import { FfmPegModle } from './ffmpeg/ffmpeg.module';

@Global()
@Module({
  imports: [
    TTSModule,
    PexelsModule,
    ScriptModule,
    ThumbNailModule,
    PixabayModule,
    SpeechModule,
    FfmPegModle,
  ],
  exports: [
    TTSModule,
    PexelsModule,
    ScriptModule,
    ThumbNailModule,
    PixabayModule,
    SpeechModule,
    FfmPegModle,
  ],
})
export class SharedModule {}
