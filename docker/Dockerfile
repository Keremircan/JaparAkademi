# JAPAR Akademi üretim imajları (karar #100). Tek Dockerfile, iki hedef:
#   app    : Next.js bağımsız sunucu (standalone)
#   worker : pg-boss işleri (ffmpeg dahil); migrate ve seed de bu imajla çalışır
#
#   docker build -f docker/Dockerfile --target app    -t japar-akademi-app .
#   docker build -f docker/Dockerfile --target worker -t japar-akademi-worker .

ARG NODE_IMAGE=node:24-bookworm-slim

# ---- Bağımlılıklar (geliştirme bağımlılıkları dahil: derleme ve worker için) ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- Derleme ----
FROM deps AS build
COPY . .
ENV NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build && node scripts/build-worker.mjs

# ---- Uygulama ----
FROM ${NODE_IMAGE} AS app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# PDF yazı tipi ve logo çalışma anında process.cwd() altından okunur
COPY --from=build --chown=node:node /app/src/server/pdf/fonts ./src/server/pdf/fonts
COPY --from=build --chown=node:node /app/src/server/pdf/assets ./src/server/pdf/assets
# Service worker rotası (/serwist/sw.js) ilk istekte src/app/sw.ts'i esbuild ile paketler;
# bağımsız çıktı izlemesi bunları içermediği için ayrıca kopyalanır
COPY --from=build --chown=node:node /app/src/app/sw.ts ./src/app/sw.ts
COPY --from=build --chown=node:node /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=build --chown=node:node /app/node_modules/@esbuild ./node_modules/@esbuild
COPY --from=build --chown=node:node /app/node_modules/serwist ./node_modules/serwist
COPY --from=build --chown=node:node /app/node_modules/idb ./node_modules/idb
COPY --from=build --chown=node:node /app/node_modules/@serwist ./node_modules/@serwist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# ---- Worker (ayrıca migrate / seed) ----
FROM ${NODE_IMAGE} AS worker
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json tsconfig.json drizzle.config.ts ./
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node messages ./messages
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node src ./src
# Worker tek ESM dosyası olarak çalışır (tsx CommonJS kipinde @react-pdf yüklenemiyor); migrate/seed tsx ile
COPY --from=build --chown=node:node /app/dist ./dist
USER node
CMD ["node", "--enable-source-maps", "dist/worker.mjs"]
