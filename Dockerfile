FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies (without dev audit overhead to save RAM)
COPY package.json ./
RUN npm install --no-audit --no-fund

# Copy code
COPY . .

# Build frontend
RUN npm run build

# Expose port
EXPOSE 3000

VOLUME ["/app/data"]

CMD ["npx", "tsx", "server.ts"]
