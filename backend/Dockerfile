# ---- Build stage: install all deps and compile TypeScript ----
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies first (better layer caching).
COPY package.json package-lock.json* ./
RUN npm install

# Compile.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune to production dependencies only.
RUN npm prune --omit=dev

# ---- Runtime stage: minimal image with compiled output + prod deps ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Run as the built-in non-root user shipped with the node image.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# Create the dashboard-config directory and give the node user ownership
# before switching to that user. The volume mount in docker-compose overrides
# this at runtime, but if no volume is used the directory is still writable.
RUN mkdir -p /app/data/configs && chown -R node:node /app/data

USER node
EXPOSE 4000

# Lightweight healthcheck against the /health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
