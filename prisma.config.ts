import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "auth_service/prisma/schema.prisma",
  migrations: {
    path: "auth_service/prisma/migrations"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
});