# Build stage
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# CapRover may inject NODE_ENV=production at build time; devDependencies are required to compile.
ENV NODE_ENV=development

COPY package.json package-lock.json ./

RUN npm ci --include=dev --no-audit --no-fund

COPY . .

RUN npm run build && npm prune --omit=dev

# Production stage
FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

USER node

CMD ["node", "dist/main.js"]
