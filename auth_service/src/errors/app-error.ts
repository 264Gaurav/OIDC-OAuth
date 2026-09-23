export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** @deprecated Use AppError. Kept so existing imports keep working during the split. */
export class AuthError extends AppError {}
