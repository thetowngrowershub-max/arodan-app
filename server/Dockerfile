# Build from the repo root:  docker build -f server/Dockerfile -t arodan-api .
FROM node:22-alpine
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY server/scripts ./scripts
COPY db /app/db
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# Bring the database up to date, then start the API.
CMD ["sh", "-c", "node scripts/migrate.js && node src/index.js"]
