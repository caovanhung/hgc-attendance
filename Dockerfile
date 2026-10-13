# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json ./
RUN npm install

# Copy source code and build frontend
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies and tsx for running server
COPY package.json ./
RUN npm install --omit=dev && npm install -g tsx

# Copy built frontend assets and server code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/data ./data
COPY --from=builder /app/index.html ./index.html

# Expose server port
EXPOSE 3000

# Volume for persistent attendance database
VOLUME ["/app/data"]

# Run server
CMD ["tsx", "server.ts"]
