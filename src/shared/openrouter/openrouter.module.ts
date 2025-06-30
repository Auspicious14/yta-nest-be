import { Module } from "@nestjs/common";
import { OpenRouterService } from "./openrouter.service";

@Module({
    imports: [],
    controllers: [],
    providers: [OpenRouterService]
})

export class OpenRouterModule {}