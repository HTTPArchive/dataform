FROM node:22-alpine

WORKDIR /app

RUN addgroup -S appuser && adduser -S -G appuser appuser

COPY package*.json ./

RUN --mount=type=cache,target=/root/.npm npm ci --only=production --quiet --no-fund --no-audit && npm cache clean --force

ENV EXPORT_CONFIG=""

COPY . .

RUN chown -R appuser:appuser /app

USER appuser

HEALTHCHECK NONE

CMD ["node", "index.js"]
