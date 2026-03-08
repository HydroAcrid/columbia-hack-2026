FROM node:20-slim

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/agent/package.json apps/agent/tsconfig.json ./apps/agent/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/graph/package.json packages/graph/tsconfig.json ./packages/graph/

RUN pnpm install --frozen-lockfile

COPY apps/agent/src ./apps/agent/src
COPY packages/shared/src ./packages/shared/src
COPY packages/graph/src ./packages/graph/src

RUN pnpm --filter @copilot/shared build \
  && pnpm --filter @copilot/graph build \
  && pnpm --filter @copilot/agent build

EXPOSE 8080

CMD ["node", "apps/agent/dist/index.js"]
