import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";

@Injectable()
export class UtilityService {
  private readonly logger = new Logger(UtilityService.name);

  async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries = 5,
    baseDelay = 1000,
    // Return undefined to satisfy TypeScript return type check
  ): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        this.logger.warn(
          `Operation ${operationName} failed (attempt ${attempt}/${maxRetries}): ${error.message}`,
        );
        if (attempt === maxRetries) {
          throw new InternalServerErrorException(
            `Operation ${operationName} failed after ${maxRetries} attempts: ${error.message}`,
          );
        }
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
