# syntax=docker/dockerfile:1
# Build from repository root:
#   docker build -f services/payment/Dockerfile -t bingchun-payment .
FROM node:22-alpine AS builder
WORKDIR /app

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_CACHE=/tmp/.npm
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"

RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY packages/db/package.json ./packages/db/
COPY packages/cors/package.json ./packages/cors/
COPY packages/delivery-domain/package.json ./packages/delivery-domain/
COPY packages/settlement/package.json ./packages/settlement/
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
COPY packages/settlement ./packages/settlement
COPY services/payment ./services/payment

RUN npm run prisma:generate -w @bingchun/db \
    && npm run build -w @bingchun/db \
    && npm run build -w @bingchun/cors \
    && npm run build -w @bingchun/settlement \
    && npm run build -w @bingchun/payment-service

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl netcat-openbsd
RUN addgroup -S bingchun && adduser -S bingchun -G bingchun

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/payment/dist ./services/payment/dist
COPY --from=builder /app/services/payment/package.json ./services/payment/package.json
COPY services/payment/docker-entrypoint.sh ./services/payment/docker-entrypoint.sh

RUN chmod +x services/payment/docker-entrypoint.sh && chown -R bingchun:bingchun /app

USER bingchun
WORKDIR /app/services/payment
EXPOSE 4300
ENV PAYMENT_PORT=4300
ENTRYPOINT ["./docker-entrypoint.sh"]
