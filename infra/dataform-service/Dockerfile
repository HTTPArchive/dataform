FROM node:22-alpine

WORKDIR /app

RUN addgroup -S appuser && adduser -S -G appuser appuser

RUN mkdir -p dataform-service/src shared
COPY dataform-service/src/package*.json ./dataform-service/src/
COPY shared/package*.json ./shared/

RUN --mount=type=cache,target=/root/.npm \
    cd dataform-service/src && npm ci --omit=dev --no-fund --no-audit

COPY dataform-service/src/ ./dataform-service/src/
COPY shared/ ./shared/

RUN chown -R appuser:appuser /app

USER appuser

WORKDIR /app/dataform-service/src

ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:$PORT/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => { process.exit(1) })" || exit 1

CMD ["npx", "functions-framework", "--target=dataform-service"]
