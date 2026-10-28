# CapRover deploy — builds notification-service from monorepo workspace layout in deploy tar.
FROM node:22-alpine AS builder
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
COPY backend/package.json ./backend/
COPY delivery-service/package.json ./delivery-service/
COPY services/notification/package.json ./services/notification/
COPY services/payment/package.json ./services/payment/
COPY services/orders/package.json ./services/orders/
COPY Frontend/package.json ./Frontend/

RUN npm install --no-audit --no-fund \
    && npm cache clean --force \
    && rm -rf /tmp/.npm /root/.npm

COPY packages/db ./packages/db
COPY packages/cors ./packages/cors
COPY services/notification ./services/notification

RUN npm run prisma:generate -w @bingchun/db \
    && npm run build -w @bingchun/db \
    && npm run build -w @bingchun/cors \
    && npm run build -w @bingchun/notification-service

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Colombo
ENV NOTIFY_PORT=4400
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apk add --no-cache openssl netcat-openbsd \
    && addgroup -S bingchun && adduser -S bingchun -G bingchun

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/notification/dist ./services/notification/dist
COPY --from=builder /app/services/notification/package.json ./services/notification/package.json
COPY services/notification/docker-entrypoint.sh ./services/notification/docker-entrypoint.sh

RUN sed -i 's/\r$//' services/notification/docker-entrypoint.sh \
    && chmod +x services/notification/docker-entrypoint.sh \
    && chown -R bingchun:bingchun /app

USER bingchun
WORKDIR /app/services/notification
EXPOSE 4400
ENTRYPOINT ["./docker-entrypoint.sh"]
