FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# `prisma` and `tsx` are devDependencies invoked via npx and never imported by
# application code, so Next's standalone tracing leaves them out. Install the
# pinned versions globally so `prisma migrate deploy` / `prisma db seed` work
# inside the shipped container without hitting the registry at deploy time.
RUN npm install -g prisma@6.19.3 tsx
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# `prisma db seed` runs prisma/seed.ts, which imports src/lib/password.ts and
# bcryptjs — neither reaches the standalone output (bcryptjs is bundled into the
# server chunks, not traced into node_modules).
COPY --from=builder /app/src ./src
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs
EXPOSE 3000
CMD ["node", "server.js"]
