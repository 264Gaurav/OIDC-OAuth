import type { ZodType } from "zod";
import { AppError } from "../errors/app-error.js";

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError(400, "Invalid request body");
  return result.data;
}

export function parseUuidParam(value: string | string[] | undefined, name: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    throw new AppError(400, `Invalid ${name}`);
  }
  return raw;
}
