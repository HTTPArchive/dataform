# checkov:skip=CKV_DOCKER_3:Ensure that a user for the container has been created
FROM node:20-slim

WORKDIR /usr/src/app

COPY . .

# Clean up the node_modules directory
RUN rm -rf node_modules

RUN npm ci --only=production

CMD ["node", "index.js"]
