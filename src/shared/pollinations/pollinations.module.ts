import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PollinationsService } from "./pollinations.service";

@Module({
  imports: [HttpModule],
  providers: [PollinationsService],
  exports: [PollinationsService],
})
export class PollinationsModule {}
