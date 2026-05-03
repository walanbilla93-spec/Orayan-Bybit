# ─── Build Stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

# ─── Runtime Stage ────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy deps from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy source
COPY server.js ./

# Non-root user for security
RUN addgroup -S orayan && adduser -S orayan -G orayan
USER orayan

EXPOSE 3001

CMD ["node", "server.js"]
