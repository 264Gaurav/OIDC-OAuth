FROM node:24-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm config set fetch-retries 5 \
	&& npm config set fetch-retry-mintimeout 20000 \
	&& npm config set fetch-retry-maxtimeout 120000 \
	&& npm ci
COPY . .
ARG DATABASE_URL=postgresql://postgres:postgres@postgres:5432/auth_service
ENV DATABASE_URL=${DATABASE_URL}
RUN npm run prisma:generate && npm run build

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/auth_service/dist ./auth_service/dist
COPY --from=build /app/auth_service/prisma ./auth_service/prisma
COPY --from=build /app/prisma.config.ts ./

EXPOSE 3000
CMD ["node", "auth_service/dist/app/server.js"]