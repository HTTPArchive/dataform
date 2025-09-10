FROM node:22-slim

# Set the working directory
WORKDIR /app

# Create a non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (this layer will be cached unless package files change)
RUN npm ci --only=production --quiet --no-fund --no-audit && npm cache clean --force

# Copy source code
COPY . .

# Change ownership of the app directory to the non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Set default port (Cloud Run will override this)
ENV PORT=8080

# Expose port for Cloud Run
EXPOSE 8080

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:$PORT/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => { process.exit(1) })" || exit 1

# Start the function
CMD ["npm", "start"]
