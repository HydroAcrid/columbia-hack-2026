FROM node:20-slim AS builder

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ARG NEXT_PUBLIC_AGENT_URL
ENV NEXT_PUBLIC_AGENT_URL=$NEXT_PUBLIC_AGENT_URL

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/tsconfig.json apps/web/next.config.ts ./apps/web/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/graph/package.json packages/graph/tsconfig.json ./packages/graph/

RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web
COPY packages/shared/src ./packages/shared/src
COPY packages/graph/src ./packages/graph/src

RUN pnpm --filter @copilot/shared build \
  && pnpm --filter @copilot/graph build \
  && pnpm --filter @copilot/web build

FROM node:20-slim AS runner

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 8080

CMD ["node", "apps/web/server.js"]
