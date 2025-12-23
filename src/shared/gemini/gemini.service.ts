import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

interface GeminiMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string;
  private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  private readonly model = "gemini-2.5-flash-lite"; // Fast and efficient model

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>("GEMINI_API_KEY") as string;
    if (!this.apiKey) {
      this.logger.error("GEMINI_API_KEY not found in environment variables");
      throw new Error("GEMINI_API_KEY is required");
    }
  }

  async generateText(
    prompt: string,
    systemInstruction?: string,
  ): Promise<string> {
    this.logger.log(
      `Generating text with Gemini for prompt: ${prompt.substring(0, 100)}...`,
    );

    try {
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

      const messages: GeminiMessage[] = [
        {
          role: "user",
          parts: [
            {
              text: systemInstruction
                ? `${systemInstruction}\n\n${prompt}`
                : prompt,
            },
          ],
        },
      ];

      const payload = {
        contents: messages,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.95,
          topK: 40,
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
      }

      const data: GeminiResponse = await response.json();

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error("No response from Gemini API");
      }

      const text = data.candidates[0].content.parts[0].text;
      this.logger.log("Successfully generated text with Gemini");
      return text;
    } catch (error) {
      this.logger.error(
        `Failed to generate text with Gemini: ${error.message}`,
      );
      throw error;
    }
  }

  async generateTextWithRetry(
    prompt: string,
    systemInstruction?: string,
    maxRetries = 3,
  ): Promise<string> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.generateText(prompt, systemInstruction);
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Gemini generation attempt ${attempt}/${maxRetries} failed: ${error.message}`,
        );

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}
