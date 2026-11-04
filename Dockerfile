# syntax=docker/dockerfile:1
FROM node:24.22.2-bookworm-slim AS base
WORKDIR /app
RUN npm install --global npm@11.19.1
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
ARG NEXT_PUBLIC_GRAPHQL_URL
ARG NEXT_PUBLIC_USD_TO_UZS=""
ARG NEXT_PUBLIC_USD_TO_KRW=""
ENV NEXT_PUBLIC_GRAPHQL_URL=$NEXT_PUBLIC_GRAPHQL_URL \
    NEXT_PUBLIC_USD_TO_UZS=$NEXT_PUBLIC_USD_TO_UZS \
    NEXT_PUBLIC_USD_TO_KRW=$NEXT_PUBLIC_USD_TO_KRW
COPY . .
RUN mkdir -p public && test -n "$NEXT_PUBLIC_GRAPHQL_URL" && npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:24.22.2-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node package.json ./
USER node
EXPOSE 3001
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3001"]
