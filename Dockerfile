FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY drizzle.config.ts ./

EXPOSE 3000

CMD ["sh", "-c", "bun run db:migrate && bun src/index.ts"]
