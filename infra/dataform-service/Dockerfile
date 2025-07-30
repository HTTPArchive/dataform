FROM node:22-slim

# Set the working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (this layer will be cached unless package files change)
RUN npm ci --only=production --quiet --no-fund --no-audit && npm cache clean --force

# Copy source code
COPY . .

# Set default port (Cloud Run will override this)
ENV PORT=8080

# Expose port for Cloud Run
EXPOSE 8080

# Start the function
CMD ["npm", "start"]
