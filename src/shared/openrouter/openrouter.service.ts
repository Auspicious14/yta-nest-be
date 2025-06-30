import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OpenRouterService {
  private OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
  private model = 'cognitivecomputations/dolphin3.0-r1-mistral-24b:free';
  private openRouter = new OpenAI({
    baseURL: this.OPENROUTER_BASE_URL,
    apiKey: process.env.OPENROUTER_API_KEY!,
  });

  constructor() {}

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
