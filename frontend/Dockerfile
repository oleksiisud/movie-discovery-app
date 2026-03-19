# Stage 1: Build
# Uses Node to compile the Angular app with SSR.
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cached unless package files change)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build for production
COPY . .
RUN npm run build

# Stage 2: Runtime
# Copies only the compiled output — no dev tools or source.
# The Angular SSR server is a Node.js Express app at:
#   dist/movie-discovery-app/server/server.mjs
FROM node:22-alpine AS runtime

WORKDIR /app

# Copy only the built output from the builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 4200

# The SSR server binds to $PORT by default in Angular's template.
# We set PORT=4200 to match the exposed port.
ENV PORT=4200

CMD ["node", "dist/movie-discovery-app/server/server.mjs"]
