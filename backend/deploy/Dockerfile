# CapRover deploy — builds backend from monorepo workspace layout in deploy tar.
# Prefer Google mirror (avoids Docker Hub "context deadline exceeded" on CapRover).
FROM mirror.gcr.io/library/node:22-alpine AS builder
WORKDIR /app

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_CACHE=/tmp/.npm
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"

RUN echo "=============================================" \
 && echo "  PHASE 1/5  System packages (openssl)" \
 && echo "=============================================" \
 && apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY packages/db/package.json ./packages/db/
COPY packages/cors/package.json ./packages/cors/
COPY packages/delivery-domain/package.json ./packages/delivery-domain/
COPY packages/settlement/package.json ./packages/settlement/
COPY backend/package.json ./backend/
COPY delivery-service/package.json ./delivery-service/
COPY Frontend/package.json ./Frontend/

RUN echo "=============================================" \
 && echo "  PHASE 2/5  npm install (workspace deps)" \
 && echo "=============================================" \
 && npm install --no-audit --no-fund \
 && npm cache clean --force \
 && rm -rf /tmp/.npm /root/.npm

COPY packages/db ./packages/db
COPY packages/cors ./packages/cors
COPY packages/delivery-domain ./packages/delivery-domain
COPY packages/settlement ./packages/settlement
COPY backend ./backend

RUN echo "=============================================" \
 && echo "  PHASE 3/5  Prisma generate + build packages" \
 && echo "=============================================" \
 && npm run prisma:generate -w @bingchun/db \
 && npm run build -w @bingchun/db \
 && npm run build -w @bingchun/delivery-domain \
 && npm run build -w @bingchun/settlement \
 && npm run build -w @bingchun/cors

RUN echo "=============================================" \
 && echo "  PHASE 4/5  Build @bingchun/backend" \
 && echo "=============================================" \
 && npm run build -w @bingchun/backend
# npm 10+ rejects `npm prune` in workspaces (exit 2 / EUSAGE).

FROM mirror.gcr.io/library/node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Colombo
ENV PORT=4000
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

RUN echo "=============================================" \
 && echo "  PHASE 5/5  Runtime image (openssl, user)" \
 && echo "=============================================" \
 && apk add --no-cache openssl netcat-openbsd \
 && addgroup -S bingchun && adduser -S bingchun -G bingchun

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/package.json ./package.json
COPY backend/prisma ./backend/prisma
COPY backend/public ./backend/public
COPY backend/assets ./backend/assets
COPY backend/docker-entrypoint.sh ./backend/docker-entrypoint.sh

RUN sed -i 's/\r$//' backend/docker-entrypoint.sh \
    && chmod +x backend/docker-entrypoint.sh \
    && chown -R bingchun:bingchun /app

USER bingchun
WORKDIR /app/backend
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
