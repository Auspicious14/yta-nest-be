import { Injectable } from '@nestjs/common';
import { OpenRouterService } from '../openrouter/openrouter.service';

@Injectable()
export class ScriptService {
  constructor(private readonly openRouterService: OpenRouterService) {}

  private async generateWithAI(
    systemPrompt: string,
    userContent: string,
  ): Promise<string> {
    return this.openRouterService.chatCompletions(systemPrompt, userContent);
  }

  async generateScript(prompt: string): Promise<string> {
    console.log(`Generating script for prompt: ${prompt}`);
    return this.generateWithAI("You're a professional youtube script writer.", prompt);
  }

  async generateVideoTitle(script: string): Promise<string> {
    console.log('Generating video title...');
    return this.generateWithAI(
      "You're a professional video title creator.",
      script,
    );
  }

  async generateVideoDescription(script: string): Promise<string> {
    console.log('Generating video description...');
    return this.generateWithAI(
      "You're a professional video description creator.",
      script,
    );
  }

  async generateTags(script: string): Promise<string[]> {
    console.log('Generating video tags...');
    const tags = await this.generateWithAI(
      "You're a professional video tag creator.",
      script,
    );
    return tags.split(',');
  }

  async generateImageSearchQuery(scriptSegment: string): Promise<string> {
    console.log(`Generating image search query for segment: ${scriptSegment}`);
    return this.generateWithAI(
      "You're a professional image search query creator.",
      scriptSegment,
    );
  }

  async generateVideoSearchQuery(scriptSegment: string): Promise<string> {
    console.log(`Generating video search query for segment: ${scriptSegment}`);
    return this.generateWithAI(
      "You're a professional video search query creator.",
      scriptSegment,
    );
  }
}
