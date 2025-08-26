# checkov:skip=CKV_DOCKER_3:Ensure that a user for the container has been created
FROM node:22-slim

# Set the working directory
WORKDIR /app

# Create a non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (this layer will be cached unless package files change)
RUN npm ci --only=production --quiet --no-fund --no-audit && npm cache clean --force

ENV EXPORT_CONFIG=""

# Copy source code
COPY . .

# Change ownership of the app directory to the non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# No healthcheck needed for one-time job containers
HEALTHCHECK NONE

CMD ["node", "index.js"]
