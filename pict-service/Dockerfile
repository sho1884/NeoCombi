# PICT-as-an-HTTP-API service.
#
# Build:  docker build -t neocombi/pict-service ./pict-service
# Run:    docker run --rm -p 8765:8765 neocombi/pict-service
# Health: curl http://localhost:8765/health
# Generate:
#   curl -sS -X POST --data-binary @examples/browsers.tmodel \
#        'http://localhost:8765/generate?order=2'
#
# Two-stage build: first builds Microsoft PICT from source, then copies the
# `pict` binary into a small Node 20 runtime that hosts the HTTP API.

FROM debian:bookworm-slim AS pict-builder
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential cmake git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth=1 https://github.com/microsoft/pict.git pict
WORKDIR /src/pict
RUN cmake -B build -S . -DCMAKE_BUILD_TYPE=Release \
 && cmake --build build -j "$(nproc)"

FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates locales \
 && sed -i '/C.UTF-8/s/^# //' /etc/locale.gen \
 && locale-gen C.UTF-8 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=pict-builder /src/pict/build/cli/pict /usr/local/bin/pict
WORKDIR /app
COPY server.mjs /app/server.mjs
ENV PORT=8765
# PICT relies on the libc ctype tables for tokenisation; under the default
# `C` locale, those tables only cover ASCII and a multi-byte input byte
# tips the tokeniser into an infinite loop (the parser never advances
# past the first non-ASCII codepoint). Enabling C.UTF-8 fixes it cleanly
# without introducing language-specific behaviour.
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
EXPOSE 8765
USER node
ENTRYPOINT ["node", "/app/server.mjs"]
