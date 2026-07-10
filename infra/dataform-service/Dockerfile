FROM node:22-alpine

WORKDIR /app

RUN addgroup -S appuser && adduser -S -G appuser appuser

RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

RUN mkdir -p dataform-service/src shared
COPY dataform-service/src/package.json dataform-service/src/pnpm-lock.yaml ./dataform-service/src/
COPY shared/package.json shared/pnpm-lock.yaml ./shared/

WORKDIR /app/shared
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts

WORKDIR /app
COPY shared/ ./shared/

WORKDIR /app/dataform-service/src
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts

WORKDIR /app

COPY dataform-service/src/ ./dataform-service/src/

RUN chown -R appuser:appuser /app


USER appuser

WORKDIR /app/dataform-service/src

ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:$PORT/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => { process.exit(1) })" || exit 1

CMD ["npx", "functions-framework", "--target=dataform-service"]
