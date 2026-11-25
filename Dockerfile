# shopdesk — self-hosted all-in-one image (API + built SPA)
# You provide MongoDB via MONGODB_URI (Atlas or any mongod). Example:
#   docker build -t shopdesk .
#   docker run -p 8787:8787 -e MONGODB_URI="mongodb://host.docker.internal:27017/shopdesk" shopdesk
# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---------- runtime stage ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY api ./api
COPY --from=build /app/dist ./dist
RUN chown -R node:node /app
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8787/api/health >/dev/null 2>&1 || exit 1
CMD ["node", "server/index.js"]
