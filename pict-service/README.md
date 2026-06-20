# pict-service

A tiny HTTP API that wraps Microsoft PICT so the NeoCombi GUI can generate
test cases without the user having to switch to a terminal. The service
runs as a Docker container next to the GUI and exposes:

- `GET  /health`            health probe; reports the PICT binary version
- `POST /generate?order=N`  body = DSL text; response = PICT TSV output (pairwise)
- `POST /decision-table`    body = DSL text; response = decision-table JSON
                            (built-in core, no PICT — UR-009)

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

| Env var               | Default | Notes                                              |
|-----------------------|---------|----------------------------------------------------|
| `PORT`                | 8765    | HTTP listen port (Cloud Run injects this)          |
| `NEOCOMBI_PICT_PATH`  | pict    | Path to the PICT executable inside the container   |
| `ALLOWED_ORIGINS`     | `*`     | Comma-separated CORS allowlist; set to your GUI origin in production |
| `PICT_TIMEOUT_MS`     | 10000   | Kill a PICT run that exceeds this                  |
| `MAX_ORDER`           | 6       | Reject `/generate` order above this                |
| `RATE_LIMIT_PER_MIN`  | 60      | Per-IP requests/min on work endpoints (0 = off)    |
| `MAX_BODY_BYTES`      | 2097152 | Request body cap                                   |

## Security

The NeoCombi / NeoCEG APIs are **public and unauthenticated by design**, and
this service runs untrusted DSL through the native PICT binary — so the only
defenses are the guardrails above. When exposing it publicly, set them:

- `ALLOWED_ORIGINS=https://your-gui-origin` (locks CORS to your GUI)
- keep `PICT_TIMEOUT_MS`, `MAX_ORDER`, `RATE_LIMIT_PER_MIN` on (bound runaway / abuse)
- deploy with a small **max-instances** so a burst can't fan out cost
- the decision-table endpoint is additionally capped at 4096 combinations

The container already runs the server as the unprivileged `node` user, writes
each model to an ephemeral temp dir, and passes PICT arguments as an array
(no shell, so no command injection).

## Deploy to Google Cloud Run (free-tier friendly)

Cloud Run scales to zero (no charge when idle) and its monthly free tier
comfortably covers a demo. From the repo root:

```bash
gcloud run deploy pict-service \
  --source ./pict-service \
  --region <your-region> \
  --allow-unauthenticated \
  --max-instances 1 \
  --concurrency 8 \
  --memory 512Mi \
  --set-env-vars "ALLOWED_ORIGINS=https://neo-combi.vercel.app"
```

`--source` builds the Dockerfile for you (PICT is compiled from source, so it
works on whatever CPU arch the platform uses). The command prints a public
HTTPS URL like `https://pict-service-xxxx.run.app`.

Then point the GUI at it by setting the build-time env var on Vercel and
redeploying:

```
VITE_PICT_API_URL = https://pict-service-xxxx.run.app
```

Verify:

```bash
curl -sS https://pict-service-xxxx.run.app/health
```

The same image runs anywhere Docker does — a small VPS, Fly.io, an
always-free VM, etc. Only the deploy command differs.

## License

MIT — same as NeoCombi. PICT itself is also MIT (Microsoft).
