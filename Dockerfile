# ChivaGo: the API and the web app it serves, in one image.
#
# ONE ORIGIN, for the same reason the tunnel does it: the browser talks to the
# host it was loaded from, so there is no CORS, no second deploy, and no build
# that has to be redone because a hostname changed.
#
# node:sqlite writes to a real file, so this needs a real disk. That rules out
# every serverless host and is why the compose below mounts a volume. A
# container without one loses every check-in, every quest and every SOS at the
# next restart, silently.

# --- build the web app ------------------------------------------------------
FROM node:24-slim AS web

RUN corepack enable
WORKDIR /repo

# Manifests first: this layer only rebuilds when a dependency actually changes,
# not on every source edit.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json      packages/core/
COPY packages/tokens/package.json    packages/tokens/
COPY apps/api/package.json           apps/api/
COPY apps/mobile/package.json        apps/mobile/
RUN pnpm install --frozen-lockfile

COPY . .

# `same-origin` is the sentinel the client reads: every request goes to the
# host that served the page. NOT the demo build - this one talks to a real API.
ENV EXPO_PUBLIC_API_URL=same-origin
RUN cd apps/mobile \
 && npx expo export --platform web --output-dir dist-live \
 && node scripts/flatten-assets.mjs dist-live

# --- the runtime image ------------------------------------------------------
FROM node:24-slim AS runtime
# ffmpeg, for stories (apps/api/src/transcode.ts): every clip is re-encoded to
# H.264 so an iPhone's HEVC plays on an Android in the same room.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json   packages/core/
COPY packages/tokens/package.json packages/tokens/
COPY apps/api/package.json        apps/api/
# The API depends on two packages. The mobile app's toolchain has no business
# in a production image, so it is not installed here.
RUN pnpm install --frozen-lockfile --filter @chivago/api...

COPY packages/ packages/
COPY apps/api/ apps/api/
COPY --from=web /repo/apps/mobile/dist-live /repo/web

# The database lives on the mounted volume, never in the image layer.
ENV CHIVAGO_DB=/data/chivago.db
ENV CHIVAGO_WEB_DIR=/repo/web
ENV PORT=8787
ENV NODE_ENV=production

# Nothing here needs root, and a process that cannot write outside /data cannot
# quietly corrupt the image it is running from.
RUN mkdir -p /data && chown -R node:node /data /repo
USER node

EXPOSE 8787

# /health is a real route that touches nothing and allocates nothing, so a
# failing check means the process is genuinely wedged rather than merely busy.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "apps/api/src/server.ts"]
