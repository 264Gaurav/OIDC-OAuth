import type { ErrorRequestHandler } from "express";
import { AuthError } from "../auth/auth.service.js";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof AuthError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }
  response.status(500).json({ error: "Internal server error" });
};