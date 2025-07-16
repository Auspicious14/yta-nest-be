import { Module } from "@nestjs/common";
import { StorageService } from "./storage.service";

@Module({
  imports: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
