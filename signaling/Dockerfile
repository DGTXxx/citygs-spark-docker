FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY signaling/package.json signaling/package.json

RUN npm ci

COPY shared shared
COPY signaling signaling

RUN npm --workspace @citygs/shared run build \
  && npm --workspace @citygs/signaling run build

ENV NODE_ENV=production
ENV PORT=8788

EXPOSE 8788

CMD ["node", "signaling/dist/server.js"]

