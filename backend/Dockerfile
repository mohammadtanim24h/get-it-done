# syntax=docker/dockerfile:1

# ---- Build stage: install all deps, generate Prisma client, compile TS ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts ./
# prisma.config.ts requires DATABASE_URL to load; generation never connects,
# so a placeholder is sufficient at build time.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Prod deps stage: fresh install, dev and peer deps excluded ----
# @prisma/client declares `prisma` (CLI) and `typescript` as peerDependencies,
# so npm marks the whole Prisma CLI tree as production-required. The compiled
# app only requires @prisma/client/runtime/* and @prisma/adapter-pg, so a
# legacy-peer-deps prune strips the CLI tree (~260MB) while keeping the
# runtime client.
FROM node:22-alpine AS deps-prod
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm prune --omit=dev --legacy-peer-deps

# ---- Runtime stage: prod deps + compiled output only, non-root user ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps-prod --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

# ---- Migrator target: full dev deps + Prisma CLI, schema and migrations ----
# One-shot container that applies migrations explicitly; the API container
# never migrates on startup.
FROM node:22-alpine AS migrator
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma.config.ts ./
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]
