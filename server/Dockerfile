# Debian-slim (not alpine) so bcrypt's prebuilt binary works without build tools.

# ─── Build: compile TypeScript (needs devDependencies) ─────────────────────
FROM node:22-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Runtime: production deps + compiled JS only ─────────────────────
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
# Served by express.static — holds uploaded avatars.
COPY public ./public

EXPOSE 3000

CMD ["node", "./dist/server.js"]
