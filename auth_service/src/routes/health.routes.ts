import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { redis } from "../db/redis.js";

export const healthRoutes = Router();

healthRoutes.get("/live", (_request, response) => {
	response.status(200).json({ status: "ok" });
});

healthRoutes.get("/ready", async (_request, response) => {
	try {
		await prisma.$queryRaw`SELECT 1`;
		if (redis.status === "wait") await redis.connect();
		await redis.ping();
		response.status(200).json({ status: "ready" });
	} catch {
		response.status(503).json({ status: "not_ready" });
	}
});
