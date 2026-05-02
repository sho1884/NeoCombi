# pict-service

A tiny HTTP API that wraps Microsoft PICT so the NeoCombi GUI can generate
test cases without the user having to switch to a terminal. The service
runs as a Docker container next to the GUI and exposes two endpoints:

- `GET  /health`            health probe; reports the PICT binary version
- `POST /generate?order=N`  body = DSL text; response = PICT TSV output

## Run

```bash
# from the repo root
docker build -t neocombi/pict-service ./pict-service
docker run --rm -p 8765:8765 neocombi/pict-service
```

Or with docker compose (see the repo-root `docker-compose.yml`).

## Try it

```bash
curl -sS http://localhost:8765/health
# {"ok":true,"available":true,"version":"...","path":"pict"}

curl -sS -X POST 'http://localhost:8765/generate?order=2' \
     -H 'Content-Type: text/plain' \
     --data-binary @../examples/browsers.tmodel
```

The response is tab-separated values, the same shape the `pict` CLI prints
to stdout. The NeoCombi GUI imports that response directly.

## Configuration

| Env var               | Default | Notes                                   |
|-----------------------|---------|-----------------------------------------|
| `PORT`                | 8765    | HTTP listen port                        |
| `NEOCOMBI_PICT_PATH`  | pict    | Path to the PICT executable inside the container |

## Security

CORS is `*` because this service is intended for **local development**
alongside the GUI. Do not expose it on a public network. The container runs
the server as the unprivileged `node` user.

## License

MIT — same as NeoCombi. PICT itself is also MIT (Microsoft).
