# ---- Build stage: install deps and produce static assets ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

# Copy all remaining source files in one step so BuildKit cannot serve a stale
# cached layer when new subdirectories (pages/, components/) are added on Windows.
COPY . .

ENV VITE_API_BASE_URL=/api
RUN npm run build

# ---- Runtime stage: static files served by nginx ----
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
