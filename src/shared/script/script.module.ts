import { Module } from "@nestjs/common";
import { OpenRouterService } from "../openrouter/openrouter.service";
import { ScriptService } from "./script.service";

@Module({
    imports: [OpenRouterService],
    // controllers: [ScriptService],
    providers: [ScriptService]
})

export class ScriptModule {}