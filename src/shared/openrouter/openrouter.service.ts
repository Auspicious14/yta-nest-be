import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenRouterService {
  private OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
  private model = 'cognitivecomputations/dolphin3.0-r1-mistral-24b:free';
  private API_KEY: string | undefined;
  private openRouter: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.API_KEY = this.configService.get('OPENROUTER_API_KEY');
    this.openRouter = new OpenAI({
      baseURL: this.OPENROUTER_BASE_URL,
      apiKey: this.API_KEY,
    });
  }
  async chatCompletions(systemPrompt: string, userContent: string) {
    const response = await this.openRouter.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });
    return response.choices[0].message.content ?? '';
  }
}
