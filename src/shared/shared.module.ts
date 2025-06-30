import { Global, Module } from '@nestjs/common';
import { PexelsModule } from './pexels/pexels.module';
import { ScriptModule } from './script/script.module';
import { TTSModule } from './tts/tts.module';
import { ThumbNailModule } from './thumbnail/thumbnail.module';
import { PixabayModule } from './pixabay/pixabay.module';

@Global()
@Module({
  imports: [
    TTSModule,
    PexelsModule,
    ScriptModule,
    ThumbNailModule,
    PixabayModule,
  ],
  exports: [
    TTSModule,
    PexelsModule,
    ScriptModule,
    ThumbNailModule,
    PixabayModule,
  ],
})
export class SharedModule {}
