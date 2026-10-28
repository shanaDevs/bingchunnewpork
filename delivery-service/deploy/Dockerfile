# CapRover deploy — builds delivery-service from monorepo workspace layout in deploy tar.
# Prefer Google mirror (avoids Docker Hub "context deadline exceeded" on CapRover).
FROM mirror.gcr.io/library/node:22-alpine AS builder
WORKDIR /app

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_CACHE=/tmp/.npm
ENV NPM_CONFIG_FETCH_RETRIES=5
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
COPY delivery-service ./delivery-service

RUN npm run prisma:generate -w @bingchun/db \
    && npm run build -w @bingchun/db \
    && npm run build -w @bingchun/delivery-domain \
    && npm run build -w @bingchun/settlement \
    && npm run build -w @bingchun/cors \
    && npm run build -w @bingchun/delivery-service

FROM mirror.gcr.io/library/node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Colombo
ENV DELIVERY_PORT=4100
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apk add --no-cache openssl netcat-openbsd
RUN addgroup -S bingchun && adduser -S bingchun -G bingchun

COPY --from=builder /app/node_modules ./node_modules
# Nested (non-hoisted) backend deps such as multer, pdfkit, qrcode — required by @bingchun/backend/dist.
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/delivery-service/dist ./delivery-service/dist
COPY --from=builder /app/delivery-service/package.json ./delivery-service/package.json
COPY delivery-service/docker-entrypoint.sh ./delivery-service/docker-entrypoint.sh

RUN sed -i 's/\r$//' delivery-service/docker-entrypoint.sh \
    && chmod +x delivery-service/docker-entrypoint.sh \
    && chown -R bingchun:bingchun /app

USER bingchun
WORKDIR /app/delivery-service
EXPOSE 4100
ENTRYPOINT ["./docker-entrypoint.sh"]
