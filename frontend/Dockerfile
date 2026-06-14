# ---- Build stage: install deps and produce static assets ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src

# Frontend talks to the backend via the nginx /api proxy (same origin).
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
