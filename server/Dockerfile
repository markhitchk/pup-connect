FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/tsconfig*.json ./server/
COPY server/src ./server/src
COPY shared ./shared
RUN npm run build && npm prune --omit=dev
FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist-signaling ./dist-signaling
USER node
EXPOSE 8080
CMD ["node","dist-signaling/server/src/index.js"]
