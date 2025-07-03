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
    return this.generateWithAI("You're a professional youtube script writer. Generate a script based on user prompt", prompt);
  }

  async generateVideoTitle(script: string): Promise<string> {
    console.log('Generating video title...');
    return this.generateWithAI(
      "You're a professional video title creator. Generate a title based on user prompt",
      script,
    );
  }

  async generateVideoDescription(script: string): Promise<string> {
    console.log('Generating video description...');
    return this.generateWithAI(
      "You're a professional video description creator. Generate a description based on user input",
      script,
    );
  }

  async generateTags(script: string): Promise<string[]> {
    console.log('Generating video tags...');
    const tags = await this.generateWithAI(
      "You're a professional video tag creator. Generate a tags based on user input",
      script,
    );
    return tags.split(',');
  }

  async generateImageSearchQuery(scriptSegment: string): Promise<string> {
    console.log(`Generating image search query for segment: ${scriptSegment}`);
    return this.generateWithAI(
      "You're a professional image search query creator. Generate an image search query based on user input",
      scriptSegment,
    );
  }

  async generateVideoSearchQuery(scriptSegment: string): Promise<string> {
    console.log(`Generating video search query for segment: ${scriptSegment}`);
    return this.generateWithAI(
      "You're a professional video search query creator. Generate a video search query based on user input",
      scriptSegment,
    );
  }
}
