import { Module } from "@nestjs/common";
import { ScriptService } from "./script.service";
import { OpenRouterModule } from "../openrouter/openrouter.module";

@Module({
    imports: [OpenRouterModule],
  providers: [ScriptService],
  exports: [ScriptService],
})
export class ScriptModule {}