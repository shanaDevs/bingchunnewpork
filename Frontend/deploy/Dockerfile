# Local / experimental CapRover build from a monorepo-staged tar.
# Production CI uses Dockerfile.prebuilt (Next.js is built in GitHub Actions).
#
# Expected stage layout (same as backend core deploy):
#   package.json, package-lock.json
#   packages/{db,delivery-domain,settlement}/package.json (+ settlement src)
#   backend/package.json, delivery-service/package.json
#   Frontend/ (app sources)
# Prefer Google mirror (avoids Docker Hub "context deadline exceeded" on CapRover).
FROM mirror.gcr.io/library/node:22-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_CACHE=/tmp/.npm
ENV NPM_CONFIG_FETCH_RETRIES=5

COPY package.json package-lock.json* ./
COPY packages/db/package.json ./packages/db/
COPY packages/delivery-domain/package.json ./packages/delivery-domain/
COPY packages/settlement/package.json ./packages/settlement/
COPY backend/package.json ./backend/
COPY delivery-service/package.json ./delivery-service/
COPY Frontend/package.json ./Frontend/

RUN npm install --no-audit --no-fund \
 && npm cache clean --force \
 && rm -rf /tmp/.npm /root/.npm

COPY packages/settlement ./packages/settlement
COPY Frontend ./Frontend

ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG WEB_SURFACE=shop
ENV WEB_SURFACE=$WEB_SURFACE
ARG BACKEND_URL=http://localhost:4000
ENV BACKEND_URL=$BACKEND_URL
ARG API_PROXY_URL=
ENV API_PROXY_URL=$API_PROXY_URL
ARG SHOP_API_URL=
ENV SHOP_API_URL=$SHOP_API_URL
ARG POS_API_URL=
ENV POS_API_URL=$POS_API_URL
ARG ADMIN_API_URL=
ENV ADMIN_API_URL=$ADMIN_API_URL
ARG ADMIN_WEB_URL=
ENV ADMIN_WEB_URL=$ADMIN_WEB_URL
ARG NEXT_PUBLIC_SOCKET_URL=
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_SITE_URL=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

RUN npm run build -w @bingchun/settlement \
 && npm run build -w @bingchun/frontend

FROM mirror.gcr.io/library/node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG WEB_SURFACE=shop
ENV WEB_SURFACE=$WEB_SURFACE
ARG BACKEND_URL=http://localhost:4000
ENV BACKEND_URL=$BACKEND_URL
ARG API_PROXY_URL=
ENV API_PROXY_URL=$API_PROXY_URL
ARG SHOP_API_URL=
ENV SHOP_API_URL=$SHOP_API_URL
ARG POS_API_URL=
ENV POS_API_URL=$POS_API_URL
ARG ADMIN_API_URL=
ENV ADMIN_API_URL=$ADMIN_API_URL
ARG ADMIN_WEB_URL=
ENV ADMIN_WEB_URL=$ADMIN_WEB_URL
RUN addgroup -S bingchun && adduser -S bingchun -G bingchun

COPY --from=builder --chown=bingchun:bingchun /app/Frontend/.next/standalone ./
COPY --from=builder /app/Frontend/public /tmp/public
COPY --from=builder --chown=bingchun:bingchun /app/Frontend/.next/static /tmp/static

RUN set -e; \
  SERVER="$(find /app -name server.js -type f ! -path '*/node_modules/*' | head -n 1)"; \
  echo "standalone server.js=${SERVER}"; \
  if [ -z "$SERVER" ]; then echo "server.js not found in standalone output"; find /app -type f | head -80; exit 1; fi; \
  DIR="$(dirname "$SERVER")"; \
  mkdir -p "$DIR/.next" "$DIR/public"; \
  cp -R /tmp/static "$DIR/.next/static"; \
  cp -R /tmp/public/. "$DIR/public/"; \
  chown -R bingchun:bingchun "$DIR/public" "$DIR/.next/static"; \
  if [ -d /app/Frontend ] && [ ! -d /app/frontend ]; then ln -s /app/Frontend /app/frontend; fi; \
  if [ -d /app/frontend ] && [ ! -d /app/Frontend ]; then ln -s /app/frontend /app/Frontend; fi

USER bingchun
# CapRover default Container HTTP Port is 80. Keep the process on 80 so a
# freshly created app works without a manual HTTP Settings change (admin-web /
# shop already set to 3000 stay fine until their next rebuild — then set
# Container HTTP Port to 80, or override PORT at runtime).
EXPOSE 80
ENV PORT=80
ENV HOSTNAME=0.0.0.0

# Force listen on CapRover's default proxy port (80). CapRover App Config
# PORT=3000 would otherwise override ENV and leave nginx pointing at a closed port.
CMD ["sh", "-c", "export PORT=80; SERVER=$(find /app -name server.js -type f ! -path '*/node_modules/*' | head -n 1); echo Using $SERVER PORT=$PORT; exec node \"$SERVER\""]
