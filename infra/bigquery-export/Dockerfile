FROM node:22-alpine

WORKDIR /app

RUN addgroup -S appuser && adduser -S -G appuser appuser

RUN mkdir -p bigquery-export/src shared
COPY bigquery-export/src/package*.json ./bigquery-export/src/
COPY shared/package*.json ./shared/

WORKDIR /app/bigquery-export/src
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-fund --no-audit

WORKDIR /app
ENV EXPORT_CONFIG=""
COPY bigquery-export/src/ ./bigquery-export/src/
COPY shared/ ./shared/

RUN chown -R appuser:appuser /app

USER appuser

WORKDIR /app/bigquery-export/src

HEALTHCHECK NONE

CMD ["node", "index.js"]
