# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
RUN mkdir -p apps/web/public
RUN pnpm --filter @askwell/widget build && pnpm --filter @askwell/web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S askwell && adduser -S askwell -G askwell

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

USER askwell

ENV PORT=3000
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
