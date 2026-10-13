FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3001
ENV TRUST_PROXY=1

EXPOSE 3001
VOLUME ["/app/data"]

CMD ["node", "server.js"]
