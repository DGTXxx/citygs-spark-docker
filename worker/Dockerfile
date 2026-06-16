FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pil \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY worker/package.json worker/package.json

RUN npm ci

COPY shared shared
COPY worker worker

RUN npm --workspace @citygs/shared run build \
  && npm --workspace @citygs/worker run build

ENV NODE_ENV=production
ENV SIGNALING_URL=ws://signaling:8788
ENV CITYGS_FRAME_SERVER_HOST=0.0.0.0
ENV CITYGS_FRAME_SERVER_PORT=8789
ENV CITYGS_PUBLIC_FRAME_BASE_URL=http://127.0.0.1:8789

EXPOSE 8789

CMD ["node", "worker/dist/citygs-worker.js"]

