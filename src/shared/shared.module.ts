import { Global, Module } from '@nestjs/common';
import { PexelsModule } from './pexels/pexels.module';
import { ScriptModule } from './script/script.module';
import { TTSModule } from './tts/tts.module';

@Global()
@Module({
  imports: [TTSModule, PexelsModule, ScriptModule],
  exports: [TTSModule, PexelsModule, ScriptModule],
})
export class SharedModule {}
