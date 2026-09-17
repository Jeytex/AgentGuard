# ==============================================================================
# AgentGuard Console — Multi-stage Production Next.js Dockerfile
# Optimized build stages, unprivileged non-root user, lightweight Alpine Linux.
# ==============================================================================

# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the production application
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

# Build arguments for frontend API and WebSocket endpoints
ARG NEXT_PUBLIC_AGENTGUARD_API_URL=http://localhost:8000/api/v1
ARG NEXT_PUBLIC_AGENTGUARD_WS_URL=ws://localhost:8000/api/v1/events/ws
ENV NEXT_PUBLIC_AGENTGUARD_API_URL=$NEXT_PUBLIC_AGENTGUARD_API_URL \
    NEXT_PUBLIC_AGENTGUARD_WS_URL=$NEXT_PUBLIC_AGENTGUARD_WS_URL

RUN npm run build

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Create unprivileged system group and user
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Copy built application and required dependencies
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs

EXPOSE 3000

# Healthcheck probe using wget
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["npm", "start"]
