FROM node:22-alpine

WORKDIR /app

RUN addgroup -S appuser && adduser -S -G appuser appuser

RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

RUN mkdir -p bigquery-export/src shared
COPY bigquery-export/src/package.json bigquery-export/src/pnpm-lock.yaml ./bigquery-export/src/
COPY shared/package.json shared/pnpm-lock.yaml ./shared/

WORKDIR /app/shared
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts

WORKDIR /app/bigquery-export/src
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts

WORKDIR /app
ENV EXPORT_CONFIG=""
COPY bigquery-export/src/ ./bigquery-export/src/
COPY shared/ ./shared/

RUN chown -R appuser:appuser /app

USER appuser

WORKDIR /app/bigquery-export/src

HEALTHCHECK NONE

CMD ["node", "index.js"]
