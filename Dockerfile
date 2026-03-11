# multi-stage build for combined backend+frontend deployment

FROM node:20-alpine AS base
WORKDIR /app

# copy lockfiles first to leverage layer caching
COPY package.json

# install deps for root scripts (none) and for potential workspace commands
RUN npm install --silent

# build client
FROM base AS client-builder
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm install --silent
COPY client/ .
RUN npm run build

# build server
FROM base AS server-builder
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm install --silent
COPY server/ .
RUN npm run build

# final runtime image
FROM node:20-alpine AS runtime
WORKDIR /app

# copy server dist and package.json for runtime dependencies
COPY --from=server-builder /app/server/dist ./server/dist
COPY server/package.json ./server/package.json

# copy built client into location expected by server code
COPY --from=client-builder /app/client/dist ./client/dist

# install only production deps for server
RUN cd server && npm install --production --silent

# port binding (Render will set PORT env)
ENV PORT=3000
EXPOSE 3000

CMD ["node","server/dist/index.js"]
