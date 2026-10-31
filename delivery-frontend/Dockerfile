# Build from repo root — see delivery-frontend/deploy/env.deploy.example for production build-args.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/settlement/package.json ./packages/settlement/
COPY delivery-frontend/package.json ./delivery-frontend/
COPY Frontend/package.json ./Frontend/
RUN npm install --workspace=@bingchun/delivery-frontend --include-workspace-root=false
COPY packages/settlement ./packages/settlement
COPY delivery-frontend ./delivery-frontend
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Browser calls admin API (delivery-jobs live on admin surface, not shop).
ARG NEXT_PUBLIC_API_URL=https://bingchun-admin-a4ndy.ondigitalocean.app/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG BACKEND_URL=https://bingchun-admin-a4ndy.ondigitalocean.app
ENV BACKEND_URL=$BACKEND_URL
ARG API_PROXY_URL=https://bingchun-admin-a4ndy.ondigitalocean.app
ENV API_PROXY_URL=$API_PROXY_URL
ARG DELIVERY_SERVICE_URL=
ENV DELIVERY_SERVICE_URL=$DELIVERY_SERVICE_URL
ARG NEXT_PUBLIC_SOCKET_URL=https://bingchun-admin-a4ndy.ondigitalocean.app
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_SITE_URL=https://bingchun-delivery-6mgs2.ondigitalocean.app
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MAIN_ADMIN_URL=https://bingchun-admin-a4ndy.ondigitalocean.app/admin
ENV NEXT_PUBLIC_MAIN_ADMIN_URL=$NEXT_PUBLIC_MAIN_ADMIN_URL
ARG NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE=true
ENV NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE=$NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE

RUN npm run build -w @bingchun/settlement \
 && npm run build -w @bingchun/delivery-frontend

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100
ARG BACKEND_URL=
ARG API_PROXY_URL=
ARG DELIVERY_SERVICE_URL=
ARG MAIN_ADMIN_URL=
ARG ADMIN_WEB_URL=
ENV BACKEND_URL=$BACKEND_URL
ENV API_PROXY_URL=$API_PROXY_URL
ENV DELIVERY_SERVICE_URL=$DELIVERY_SERVICE_URL
ENV MAIN_ADMIN_URL=$MAIN_ADMIN_URL
ENV ADMIN_WEB_URL=$ADMIN_WEB_URL
COPY --from=builder /app/delivery-frontend/.next/standalone ./
COPY --from=builder /app/delivery-frontend/.next/static ./delivery-frontend/.next/static
COPY --from=builder /app/delivery-frontend/public ./delivery-frontend/public
EXPOSE 3100
CMD ["node", "delivery-frontend/server.js"]
