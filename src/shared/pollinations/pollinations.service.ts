import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { lastValueFrom } from "rxjs";

@Injectable()
export class PollinationsService {
  private readonly logger = new Logger(PollinationsService.name);
  private readonly baseUrl = "https://text.pollinations.ai";

  constructor(private readonly httpService: HttpService) {}

  async generateText(prompt: string): Promise<string> {
    this.logger.log(
      `Generating text with Pollinations.ai for prompt: ${prompt.substring(0, 100)}...,`,
    );
    try {
      const payload = {
        model: "openai",
        messages: [{ role: "user", content: prompt }],
        jsonMode: false,
        seed: 42,
        stream: false,
      };
      const response = await lastValueFrom(
      this.httpService.post(this.baseUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
      return response.data.choices[0].message.content;
    } catch (error) {
      this.logger.error(
        `Failed to generate text with Pollinations.ai: ${error.message},
    `,
      );
      throw error;
    }
  }
}
