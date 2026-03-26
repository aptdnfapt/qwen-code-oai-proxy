export class ErrorFormatter {
  static openAIApiError(message: string, type = "api_error", code = 500): { status: number; body: any } {
    return {
      status: code,
      body: {
        error: {
          message,
          type,
          code,
        },
      },
    };
  }

  static openAIValidationError(message: string): { status: number; body: any } {
    return this.openAIApiError(message, "validation_error", 400);
  }

  static openAIAuthError(message = "Not authenticated with Qwen. Please authenticate first."): { status: number; body: any } {
    return this.openAIApiError(message, "authentication_error", 401);
  }

  static openAIRateLimitError(message = "Rate limit exceeded"): { status: number; body: any } {
    return this.openAIApiError(message, "rate_limit_exceeded", 429);
  }
}
