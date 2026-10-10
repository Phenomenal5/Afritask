# Debian-slim (not alpine) so bcrypt's prebuilt binary works without build tools.

# ─── Build: compile TypeScript (needs devDependencies) ─────────────────────
FROM node:22-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
# build = prisma generate (client into src/generated) + tsc
RUN npm run build

# ─── Runtime: production deps + compiled JS only ─────────────────────
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production
# NOTE: the server defaults to 5000, but this image publishes 3000 — pin it so the
# container listens where EXPOSE and the compose port mapping say it does.
ENV PORT=3000
# Shown by GET /api/health so you can tell which build is live (pass the git SHA).
ARG RELEASE_VERSION=dev
ENV RELEASE_VERSION=$RELEASE_VERSION

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
# Schema + migrations so the container can run `npm run db:deploy` before starting.
COPY prisma.config.ts ./
COPY prisma ./prisma
# Served by express.static — holds uploaded avatars.
COPY public ./public

EXPOSE 3000

# Liveness only (no database call), so a slow dependency never gets the container restarted.
# The slim image has no curl; Node's fetch does the job.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations run as a separate release step (`npm run db:deploy`), never on every boot —
# see docs/RELEASE.md. Node receives SIGTERM directly (exec form) for graceful shutdown.
CMD ["node", "./dist/server.js"]
