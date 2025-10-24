import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { lastValueFrom } from "rxjs";

@Injectable()
export class PollinationsService {
  private readonly logger = new Logger(PollinationsService.name);
  private readonly baseUrl = "https://text.pollinations.ai";

  constructor(private readonly httpService: HttpService) {}

  async generateText(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    this.logger.log(
      `Generating text with Pollinations.ai for prompt: ${userPrompt}`,
    );
    try {
      const payload = {
        model: "openai",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      };
      const response = await lastValueFrom(
        this.httpService.post(`${this.baseUrl}/openai`, payload),
      );
      return response.data.choices[0].message.content;
    } catch (error) {
      this.logger.error(
        `Failed to generate text with Pollinations.ai: ${error.message}`,
      );
      throw error;
    }
  }
}
