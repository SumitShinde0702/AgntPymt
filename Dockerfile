# AgntPymt — Cloud Run / GCE (API + static UI)
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY db/package.json ./db/

RUN npm ci

COPY . .

# Same-origin API in production (empty = browser uses current host)
ARG VITE_API_URL=
ARG VITE_APP_NAME=AgntPymt
ARG VITE_CLERK_PUBLISHABLE_KEY=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# Ephemeral local cache; GCS is source of truth when GCS_PROFILE_BUCKET is set
ENV HERMES_HOME=/tmp/hermes

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY db/package.json ./db/

RUN npm ci --omit=dev

COPY --from=build /app/db/dist ./db/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY deploy/docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
