FROM node:20-bookworm-slim

WORKDIR /app

ARG CRM_AUTO_PRISMA_CLIENT=sqlite

COPY package*.json ./
COPY prisma ./prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm ci

COPY . .

RUN npx prisma generate \
  && npx prisma generate --schema prisma/schema.sqlite.prisma \
  && if [ "$CRM_AUTO_PRISMA_CLIENT" = "sqlite" ]; then npm run build:demo:sqlite; else npm run build; fi

ENV NODE_ENV=production
ENV CRM_AUTO_PRISMA_CLIENT=${CRM_AUTO_PRISMA_CLIENT}

EXPOSE 3000

RUN chmod +x /app/docker-entrypoint.sh

CMD ["/app/docker-entrypoint.sh"]
