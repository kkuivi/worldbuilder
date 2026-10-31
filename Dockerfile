FROM oven/bun:1.4.2
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY supabase ./supabase

RUN bun install --frozen-lockfile
RUN bun run build

ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

CMD ["bun", "run", "apps/orchestrator/src/index.ts"]
