# Stage 1: Install production dependencies
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache build-base python3 py3-setuptools
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: Build
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache build-base python3 py3-setuptools
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy full node_modules from deps stage so native addons
# (better-sqlite3 .node binary) are guaranteed to be present
COPY --from=deps /app/node_modules ./node_modules

RUN mkdir -p /data
ENV SQLITE_PATH=/data/flipflap.db

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
