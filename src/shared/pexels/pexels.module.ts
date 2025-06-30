import { Module } from '@nestjs/common';
import { PexelsService } from './pexels.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
      }),
    }),
  ],
  providers: [PexelsService],
  exports: [PexelsService],
})
export class PexelsModule {}
