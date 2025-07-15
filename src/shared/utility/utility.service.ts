import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";

@Injectable()
export class UtilityService {
  private readonly logger = new Logger(UtilityService.name);

  /**
   * Retries an asynchronous operation multiple times with exponential backoff.
   * @param operation The asynchronous function to retry.
   * @param operationName A descriptive name for the operation (for logging).
   * @param maxRetries The maximum number of retry attempts.
   * @param baseDelay The base delay in milliseconds before the first retry.
   * @returns A promise that resolves with the result of the operation or rejects if all retries fail.
   */
  async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries = 5,
    baseDelay = 1000,
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
