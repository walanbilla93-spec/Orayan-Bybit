# ─── Build Stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (cache layer)
COPY package.json package-lock.json* ./

# Install production deps only
RUN npm install --omit=dev

# ─── Runtime Stage ────────────────────────────────────────────────────────────
FROM node:20-alpine

# Create non-root user BEFORE copying files
RUN addgroup -S orayan && adduser -S orayan -G orayan

WORKDIR /app

# Copy deps from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy all source files explicitly
COPY package.json ./
COPY server.js ./

# Set ownership
RUN chown -R orayan:orayan /app

USER orayan

EXPOSE 3001

CMD ["node", "server.js"]
