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

# Copy server code
COPY server.ts server-validation.ts ./

# Expose ports (3001 for API)
EXPOSE 3001

# Create volume mount point for database
RUN mkdir -p /app/data

# Sync schema (works with existing DB; migrate deploy needs baselining for non-empty DBs)
CMD npx prisma db push && npm run server

