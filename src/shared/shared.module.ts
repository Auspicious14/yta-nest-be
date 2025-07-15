import { Global, Module } from "@nestjs/common";
import { PexelsModule } from "./pexels/pexels.module";
import { ScriptModule } from "./script/script.module";
import { TTSModule } from "./tts/tts.module";
import { ThumbNailModule } from "./thumbnail/thumbnail.module";
import { MusicModule } from "./music/music.module";
import { PixabayModule } from "./pixabay/pixabay.module";
import { FfmPegModle } from "./ffmpeg/ffmpeg.module";
import { StorageModule } from "./storage/storage.module";
import { UtilityModule } from "./utility/utility.module";

@Global()
@Module({
  imports: [
    TTSModule,
    PexelsModule,
    ScriptModule,
    ThumbNailModule,
    PixabayModule,
    FfmPegModle,
    MusicModule,
    StorageModule,
    UtilityModule,
  ],
  exports: [
    TTSModule,
    PexelsModule,
    ScriptModule,
    ThumbNailModule,
    PixabayModule,
    FfmPegModle,
    MusicModule,
    StorageModule,
    UtilityModule
  ],
})
export class SharedModule {}
