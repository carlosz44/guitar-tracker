# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --offline --frozen-lockfile
RUN pnpm build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @ds/server deploy --prod /out/server

FROM node:24-alpine AS runtime
RUN apk add --no-cache postgresql16-client
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/server/package.json apps/server/package.json
COPY --from=build /out/server/node_modules apps/server/node_modules
COPY --from=build /repo/apps/server/dist apps/server/dist
COPY --from=build /repo/apps/server/drizzle apps/server/drizzle
COPY --from=build /repo/apps/web/dist apps/web/dist
USER node
EXPOSE 3000
CMD ["node", "apps/server/dist/api.js"]
