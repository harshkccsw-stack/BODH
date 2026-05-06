# ---------- Stage 1: build the static bundle ----------
FROM node:20-alpine AS build
WORKDIR /app

# Build-time configuration. Vite inlines VITE_* values at build time, so
# changing these after `docker build` requires a rebuild of this image.
ARG VITE_API_URL=http://localhost:4000/api/v1
ARG VITE_BASE_PATH=/
ARG VITE_APP_NAME=BodhAssess
ARG VITE_AUTH_STORAGE_KEY=bodhassess.auth.token
ARG VITE_PRACTITIONER_AUTH_STORAGE_KEY=bodhassess.practitioner.token
ENV VITE_API_URL=$VITE_API_URL \
    VITE_BASE_PATH=$VITE_BASE_PATH \
    VITE_APP_NAME=$VITE_APP_NAME \
    VITE_AUTH_STORAGE_KEY=$VITE_AUTH_STORAGE_KEY \
    VITE_PRACTITIONER_AUTH_STORAGE_KEY=$VITE_PRACTITIONER_AUTH_STORAGE_KEY

# Cache deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Build
COPY . .
RUN npm run build

# ---------- Stage 2: serve via nginx ----------
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
