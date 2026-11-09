# Public synthetic demo. No poppler, no official booklet, non-root runtime.
FROM node:22-bookworm-slim AS build
WORKDIR /src
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUBLIC_DEMO=1
ENV PUBLIC_RELEASE=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN chmod 755 docker-entrypoint.sh && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUBLIC_DEMO=1
ENV PUBLIC_RELEASE=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /src/.next/standalone ./
COPY --from=build --chown=node:node /src/.next/static ./.next/static
COPY --from=build --chown=node:node /src/fixtures ./fixtures
COPY --from=build --chown=node:node /src/docker-entrypoint.sh ./docker-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
