# syntax=docker/dockerfile:1
# Build from repository root:
#   docker build -f backend/Dockerfile -t bingchun-backend .
FROM node:22-alpine AS builder
WORKDIR /app

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_CACHE=/tmp/.npm
# prisma generate validates datasource url; no live DB is needed at build time
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"

RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY packages/db/package.json ./packages/db/
COPY packages/cors/package.json ./packages/cors/
COPY packages/delivery-domain/package.json ./packages/delivery-domain/
COPY packages/settlement/package.json ./packages/settlement/
COPY backend/package.json ./backend/
COPY delivery-service/package.json ./delivery-service/
COPY Frontend/package.json ./Frontend/

RUN npm install --no-audit --no-fund \
    && npm cache clean --force \
    && rm -rf /tmp/.npm /root/.npm

COPY packages/db ./packages/db
COPY packages/cors ./packages/cors
COPY packages/delivery-domain ./packages/delivery-domain
COPY packages/settlement ./packages/settlement
COPY backend ./backend

RUN npm run prisma:generate -w @bingchun/db
RUN npm run build -w @bingchun/db
RUN npm run build -w @bingchun/delivery-domain
RUN npm run build -w @bingchun/settlement
RUN npm run build -w @bingchun/cors
RUN npm run build -w @bingchun/backend

# Do not `npm prune --omit=dev` here: npm 10+ rejects prune in workspaces (exit 2).
# Production image still only copies compiled output + node_modules from this stage.

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl netcat-openbsd
RUN addgroup -S bingchun && adduser -S bingchun -G bingchun

ARG API_SURFACE=core
ENV API_SURFACE=$API_SURFACE

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY backend/public ./backend/public
COPY backend/docker-entrypoint.sh ./backend/docker-entrypoint.sh

RUN chmod +x backend/docker-entrypoint.sh && chown -R bingchun:bingchun /app

USER bingchun
WORKDIR /app/backend
EXPOSE 4000
ENV PORT=4000
ENTRYPOINT ["./docker-entrypoint.sh"]
