FROM oven/bun:1

WORKDIR /app

# Create data directory for SQLite database
RUN mkdir -p /app/data

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

# Volume for persistent data
VOLUME ["/app/data"]

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
