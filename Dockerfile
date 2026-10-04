# Build stage: run the static export (site links rendered, assets fingerprinted).
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
COPY content ./content
COPY public ./public
RUN node scripts/export.mts

# Runtime stage: the same server, serving the exported dist/ (so production gets fingerprinted,
# long-cached assets exactly like the Cloudflare Pages deploy).
FROM node:26-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY src ./src
COPY content ./content
COPY --from=build /app/dist ./dist
USER node
ENV HOST=0.0.0.0 PORT=8080 STATIC_DIR=/app/dist
EXPOSE 8080
CMD ["node", "src/server.mts"]
