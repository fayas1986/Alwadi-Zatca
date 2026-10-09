# Multi-stage Production Dockerfile for Alwadi-Zatca
# Base Stage with Node.js 20 & OpenJDK 17 Runtime
FROM node:20-alpine AS base

RUN apk add --no-cache openjdk17-jre curl bash

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client and build static assets
RUN npx prisma generate
RUN npm run build

# Production Stage
FROM node:20-alpine AS runner

RUN apk add --no-cache openjdk17-jre curl bash

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV ZATCA_SDK_PATH="./server/zatca-sdk/zatca-sdk.jar"
ENV JAVA_EXE_PATH="java"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 zatcauser

# Copy application artifacts from build stage
COPY --chown=zatcauser:nodejs --from=base /app/package.json ./package.json
COPY --chown=zatcauser:nodejs --from=base /app/package-lock.json ./package-lock.json
COPY --chown=zatcauser:nodejs --from=base /app/node_modules ./node_modules
COPY --chown=zatcauser:nodejs --from=base /app/prisma ./prisma
COPY --chown=zatcauser:nodejs --from=base /app/server ./server
COPY --chown=zatcauser:nodejs --from=base /app/dist ./dist
COPY --chown=zatcauser:nodejs --from=base /app/public ./public

# Switch to non-root user
USER zatcauser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["npx", "tsx", "server/src/index.ts"]
