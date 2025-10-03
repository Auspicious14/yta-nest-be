import { Injectable, Logger } from "@nestjs/common";
import { OpenRouterService } from "../openrouter/openrouter.service";
import { UtilityService } from "../utility/utility.service";
import { JobDocument } from "src/schemas";

@Injectable()
export class ScriptService {
  private readonly logger = new Logger(ScriptService.name);

  constructor(
    private readonly openRouterService: OpenRouterService,
    private readonly utilityService: UtilityService,
  ) {}

  private async generateWithAI(
    systemPrompt: string,
    userContent: string,
  ): Promise<string> {
    const prompt = `
${systemPrompt}

Constraints:
1. Return only the requested content as raw text, as specified.
2. Do not include any preamble, explanations, or meta-information (e.g., "Below is the...", "Here are the tags", "Okay, so I need to create...", etc.). Return only the direct content requested.
3. Do not use markdown, bullet points, or numbered lists unless explicitly requested.
4. Respond in English unless otherwise specified.
5. Keep output concise and relevant to the prompt.

User Input:
${userContent}
    `.trim();

    const response = await this.openRouterService.chatCompletions(
      systemPrompt,
      prompt,
    );
    if (!response) {
      throw new Error("Empty response from OpenRouter");
    }
    return response.replace(/\n/g, " ").trim(); // Remove newlines and extra spaces
  }

  async generateScript(prompt: string): Promise<string> {
    this.logger.log(`Generating script for prompt: ${prompt}`);
    return this.generateWithAI(
      `You're a professional YouTube script writer. Generate a concise, natural, and conversational script based on the user prompt. Include common conversational fillers like "okay," "so," "um," "you know," and "like" where appropriate to make it sound human. Focus solely on the script content.`,
      prompt,
    );
  }

  async generateVideoTitle(script: string): Promise<string> {
    this.logger.log("Generating video title...");
    return this.generateWithAI(
      `You're a professional video title creator. Generate a concise, engaging title based on the script. Ensure the title is optimized for search queries and aligns with potential video descriptions and tags.`,
      script,
    );
  }

  async generateVideoDescription(script: string): Promise<string> {
    this.logger.log("Generating video description...");
    return this.generateWithAI(
      `You're a professional video description creator. Generate only the concise, SEO-friendly description text based on the script. Ensure it complements the video title and is relevant to the generated tags and search queries. Do not include any labels like "Description:" or "Video Title:" in the output.`,
      script,
    );
  }

  async generateTags(script: string): Promise<string[]> {
    this.logger.log("Generating video tags...");
    const prompt = `
You're a professional video tag creator. Generate 5 single-word tags based on the script.

Constraints:
1. Return a JSON array of 5 single-word strings (e.g., ["tag1", "tag2", "tag3", "tag4", "tag5"]).
2. Each tag must be a single word, relevant to the script's content.
3. Do not include any preamble, explanations, or meta-information.
4. Do not use markdown, bullet points, or numbered lists.

Script:
${script}
    `.trim();

    const rawResponse = await this.generateWithAI("", prompt);
    try {
      const tags = JSON.parse(rawResponse);
      if (
        Array.isArray(tags) &&
        tags.every(
          (tag) => typeof tag === "string" && tag.split(" ").length === 1,
        )
      ) {
        return tags.slice(0, 5);
      }
      throw new Error("Invalid tag format");
    } catch (error) {
      this.logger.warn(
        `Tag parsing failed, falling back to cleaning: ${error.message}`,
      );
      // Fallback: clean and split non-JSON response
      const cleaned = rawResponse
        .replace(
          /\[.*\]|\(.*\)|Okay|Below is|Tags:|Here are|Generated tags|[0-9]+\.|[\*\-\#]/gi,
          "",
        ) // Remove pretext and markdown
        .split(/,|\n|\s+/)
        .map((tag) => tag.trim())
        .filter((tag) => tag && tag.split(" ").length === 1)
        .slice(0, 5);
      if (cleaned.length === 0) {
        throw new Error("No valid tags found after cleaning");
      }
      return cleaned;
    }
  }

  async generateImageSearchQuery(scriptSegment: string): Promise<string> {
    this.logger.log(
      `Generating image search query for segment: ${scriptSegment}`,
    );
    return this.generateWithAI(
      `You're a professional image search query creator. Generate a concise, 1-3 word search query based on the script segment.`,
      scriptSegment,
    );
  }

  async generateVideoSearchQuery(scriptSegment: string): Promise<string> {
    this.logger.log(
      `Generating video search query for segment: ${scriptSegment}`,
    );
    return this.generateWithAI(
      `You're a professional video search query creator. Generate a concise, 1-3 word search query based on the script segment.`,
      scriptSegment,
    );
  }

  async generateScriptAndMetadata(
    prompt: string,
    job: JobDocument,
  ): Promise<{
    script: string;
    title: string;
    description: string;
    tags: string[];
    imageSearchQuery: string;
    videoSearchQuery: string;
  }> {
    console.time("script-and-metadata");
    const [
      script,
      title,
      description,
      tags,
      imageSearchQuery,
      videoSearchQuery,
    ] = await Promise.all([
      this.utilityService.retryOperation(
        () => this.generateScript(prompt),
        "Script generation",
      ),
      this.utilityService.retryOperation(
        () => this.generateVideoTitle(prompt),
        "Title generation",
      ),
      this.utilityService.retryOperation(
        () => this.generateVideoDescription(prompt),
        "Description generation",
      ),
      this.utilityService.retryOperation(
        () => this.generateTags(prompt),
        "Tags generation",
      ),
      this.utilityService.retryOperation(
        () => this.generateImageSearchQuery(prompt),
        "Image query generation",
      ),
      this.utilityService.retryOperation(
        () => this.generateVideoSearchQuery(prompt),
        "Video query generation",
      ),
    ]);
    console.timeEnd("script-and-metadata");
    return {
      script,
      title,
      description,
      tags,
      imageSearchQuery,
      videoSearchQuery,
    };
  }
}
