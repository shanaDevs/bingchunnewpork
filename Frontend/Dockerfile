# Prefer Frontend/deploy/Dockerfile.prebuilt via CI (build in GitHub Actions).
# This file is kept for local monorepo-context docker builds only.
# CapRover production deploys use the prebuilt flow in ci-cd-new-server.yml.
FROM node:22-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json package-lock.json* ./
COPY packages/db/package.json ./packages/db/
COPY packages/delivery-domain/package.json ./packages/delivery-domain/
COPY packages/settlement/package.json ./packages/settlement/
COPY backend/package.json ./backend/
COPY delivery-service/package.json ./delivery-service/
COPY Frontend/package.json ./Frontend/

RUN npm install --no-audit --no-fund

COPY packages/settlement ./packages/settlement
COPY Frontend ./Frontend

ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG BACKEND_URL=http://localhost:4000
ENV BACKEND_URL=$BACKEND_URL
ARG API_PROXY_URL=
ENV API_PROXY_URL=$API_PROXY_URL

RUN npm run build -w @bingchun/settlement \
 && npm run build -w @bingchun/frontend

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG BACKEND_URL=http://localhost:4000
ARG API_PROXY_URL=
ENV BACKEND_URL=$BACKEND_URL
ENV API_PROXY_URL=$API_PROXY_URL
RUN addgroup -S bingchun && adduser -S bingchun -G bingchun

COPY --from=builder --chown=bingchun:bingchun /app/Frontend/.next/standalone ./
COPY --from=builder /app/Frontend/public /tmp/public
COPY --from=builder --chown=bingchun:bingchun /app/Frontend/.next/static /tmp/static

RUN set -e; \
  SERVER="$(find /app -name server.js -type f ! -path '*/node_modules/*' | head -n 1)"; \
  if [ -z "$SERVER" ]; then echo "server.js not found"; exit 1; fi; \
  DIR="$(dirname "$SERVER")"; \
  mkdir -p "$DIR/.next" "$DIR/public"; \
  cp -R /tmp/static "$DIR/.next/static"; \
  cp -R /tmp/public/. "$DIR/public/"; \
  chown -R bingchun:bingchun "$DIR/public" "$DIR/.next/static"; \
  if [ -d /app/Frontend ] && [ ! -d /app/frontend ]; then ln -s /app/Frontend /app/frontend; fi; \
  if [ -d /app/frontend ] && [ ! -d /app/Frontend ]; then ln -s /app/frontend /app/Frontend; fi

USER bingchun
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["sh", "-c", "SERVER=$(find /app -name server.js -type f ! -path '*/node_modules/*' | head -n 1); exec node \"$SERVER\""]
