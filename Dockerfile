# Multi-stage build for optimized production image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (including devDependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build frontend
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy Prisma client from builder
COPY --from=builder /app/src/generated ./src/generated

# Copy built frontend
COPY --from=builder /app/build ./build

# Copy server code and its runtime source dependencies
COPY server.ts server-validation.ts ai.config.ts ./
COPY server ./server
COPY skills ./skills
COPY src/utils ./src/utils
COPY src/config ./src/config

# Expose ports (3001 for API)
EXPOSE 3001

# Create volume mount point for database
RUN mkdir -p /app/data

# Apply committed migrations (no data loss; a full migration history lives in prisma/migrations)
CMD npx prisma migrate deploy && npm run server

