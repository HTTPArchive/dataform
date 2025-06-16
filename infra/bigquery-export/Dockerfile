# checkov:skip=CKV_DOCKER_3:Ensure that a user for the container has been created
FROM node:current-slim

WORKDIR /usr/src/app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --quiet --no-fund --no-audit

# Copy source code
COPY . .

CMD ["node", "index.js"]
