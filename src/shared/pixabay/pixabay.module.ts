import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PixabayService } from './pixabay.service';

@Module({
  imports: [HttpModule],
  providers: [PixabayService],
  exports: [PixabayService],
})
export class PixabayModule {}
