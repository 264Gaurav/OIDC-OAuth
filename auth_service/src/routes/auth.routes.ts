import { Router } from "express";
import { z } from "zod";
import { AuthError, login, logout, refresh, register } from "../auth/auth.service.js";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(12).max(128)
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export const authRoutes = Router();

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new AuthError(400, "Invalid request body");
  return result.data;
}

authRoutes.post("/register", async (request, response, next) => {
  try {
    const body = parseBody(credentialsSchema, request.body);
    response.status(201).json(await register(body.email, body.password));
  } catch (error) {
    next(error);
  }
});

authRoutes.post("/login", async (request, response, next) => {
  try {
    const body = parseBody(credentialsSchema, request.body);
    response.status(200).json(await login(body.email, body.password));
  } catch (error) {
    next(error);
  }
});

authRoutes.post("/refresh", async (request, response, next) => {
  try {
    const body = parseBody(refreshSchema, request.body);
    response.status(200).json(await refresh(body.refreshToken));
  } catch (error) {
    next(error);
  }
});

authRoutes.post("/logout", async (request, response, next) => {
  try {
    const body = parseBody(refreshSchema, request.body);
    await logout(body.refreshToken);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});