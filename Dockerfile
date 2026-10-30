# syntax=docker/dockerfile:1
# The dev UI as a small static file server on port 8080 (Caddy, unprivileged).
#   docker build -t lmoxide-dev-ui .
# Its pages use relative paths, so it works at any path (lmoxide's docker-compose.yml serves it at
# /dev/). The API base defaults to /api on the page's origin (VITE_API_URL); the sign-in page's
# Server... box changes it.

FROM node:24-alpine AS build
RUN npm install -g pnpm@10
WORKDIR /src
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_URL=/api
RUN [ -n "$VITE_API_URL" ] || unset VITE_API_URL; pnpm build

FROM caddy:2-alpine
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist/ /srv/
RUN adduser -D -H -u 10004 web && mkdir -p /data /config && chown web /data /config
USER web
EXPOSE 8080
