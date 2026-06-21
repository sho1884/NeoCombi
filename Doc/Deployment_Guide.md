# NeoCombi Deployment & Operations Guide / NeoCombi 導入・運用ガイド

**Version**: 1.0 **Date**: 2026-06-20
**Audience**: administrators self-hosting the open-source NeoCombi — running the
PICT service, wiring the GUI, using the CLI in CI/CD, and calling the HTTP API.
End users designing tests want the [User Manual](User_Manual.md) instead.

**対象読者**：OSS の NeoCombi を**自分で導入・運用**する管理者（PICT サービスの配備、
GUI との接続、CI/CD での CLI、HTTP API）。テスト設計をする利用者は[ユーザーマニュアル](User_Manual.md)へ。

---

## Table of Contents / 目次

1. [Architecture / アーキテクチャ](#1-architecture--アーキテクチャ)
2. [Prerequisites / 前提](#2-prerequisites--前提)
3. [Deploy the GUI / GUI の配備](#3-deploy-the-gui--gui-の配備)
4. [Deploy the PICT Service / PICT サービスの配備](#4-deploy-the-pict-service--pict-サービスの配備)
5. [Wire the GUI to the Service / GUI とサービスの接続](#5-wire-the-gui-to-the-service--gui-とサービスの接続)
6. [Security & Guardrails / セキュリティとガードレール](#6-security--guardrails--セキュリティとガードレール)
7. [Configuration Reference / 設定リファレンス](#7-configuration-reference--設定リファレンス)
8. [Hosting Samples / サンプルの配信](#8-hosting-samples--サンプルの配信)
9. [CLI in CI/CD / CI-CD での CLI](#9-cli-in-cicd--ci-cd-での-cli)
10. [HTTP API Reference / HTTP API リファレンス](#10-http-api-reference--http-api-リファレンス)
11. [Operations & Troubleshooting / 運用とトラブルシューティング](#11-operations--troubleshooting--運用とトラブルシューティング)

---

## 1. Architecture / アーキテクチャ

NeoCombi separates a thin, stateless front end from the one piece that needs a
native binary (PICT).

NeoCombi は、薄くて状態を持たないフロントと、ネイティブバイナリ（PICT）を要する1要素を
分離しています。

| Component / 構成要素 | What / 何 | Where it runs / 動く場所 | State / 状態 |
|---|---|---|---|
| **GUI** | the browser app | static hosting (e.g. Vercel) | none |
| **Built-in core** | DSL evaluator + decision-table generator | in the browser **and** in the CLI (bundled) | none |
| **PICT service** | HTTP wrapper around the PICT binary | a container you run | none |

Key consequence: **decision-table** generation, the forbidden view, and the
coverage matrix run **client-side** (browser) or **in-process** (CLI) — no server.
Only **pairwise / N-wise** generation calls the **PICT service**. So the only
thing you must stand up for full functionality is the PICT service.

要点：**デシジョンテーブル**生成・禁則ビュー・総当たり表は**クライアント側**（ブラウザ）
または **CLI 内**で動き、サーバ不要。**ペアワイズ / N-wise** だけが **PICT サービス**を
呼びます。完全動作のために立てるべきは PICT サービスだけです。

The same PICT service is also the HTTP API (`/generate`, `/decision-table`,
`/health`) for programmatic / CI callers ([§10](#10-http-api-reference--http-api-リファレンス)).

同じ PICT サービスが、プログラム/CI 向けの HTTP API も兼ねます。

---

## 2. Prerequisites / 前提

- **Node.js** (18+) and **npm** — to build the GUI and run the CLI.
- **Docker** — to build/run the PICT service container (it compiles PICT from
  source, so no separate PICT install is needed in the container).
- A place to host: a static host for the GUI (Vercel, Netlify, any static host)
  and a container host for the PICT service (Cloud Run, Render, Fly.io, a VPS…).

Node.js（18+）/ npm（GUI ビルド・CLI）、Docker（PICT サービス。PICT はソースから
ビルドされるので別途インストール不要）、ホスティング先（GUI 用の静的ホスト、PICT
サービス用のコンテナホスト）。

---

## 3. Deploy the GUI / GUI の配備

The GUI is a static site built with Vite.

```bash
npm install
VITE_PICT_API_URL="https://your-pict-service" npm run build   # outputs dist/
```

Serve `dist/` from any static host. On Vercel, set `VITE_PICT_API_URL` as a
project **environment variable** and redeploy (it is read at **build time**, so a
new build is required after changing it).

`dist/` を任意の静的ホストで配信します。Vercel では `VITE_PICT_API_URL` を環境変数に
設定し再デプロイ（**ビルド時**に読まれるため変更後は再ビルドが必要）。

If `VITE_PICT_API_URL` is unset, the GUI still works for decision-table mode; the
pairwise banner explains that no PICT service is configured.

未設定でもデシジョンテーブルは動作し、ペアワイズはバナーで「未設定」と案内されます。

---

## 4. Deploy the PICT Service / PICT サービスの配備

The service is [`pict-service/`](../pict-service/) — a small Node HTTP server plus
the PICT binary, built by a multi-stage Dockerfile.

**Local / ローカル**

```bash
docker build -t neocombi/pict-service ./pict-service
docker run --rm -p 8765:8765 \
  -e ALLOWED_ORIGINS="https://your-gui-origin" \
  neocombi/pict-service
curl -sS http://localhost:8765/health
```

**Cloud Run / クラウド (scale-to-zero, free-tier friendly)**

```bash
gcloud run deploy pict-service \
  --source ./pict-service --region <region> \
  --allow-unauthenticated --max-instances 1 --concurrency 8 --memory 512Mi \
  --set-env-vars "ALLOWED_ORIGINS=https://your-gui-origin"
```

**Other hosts.** The same Dockerfile runs on Render, Fly.io, a VPS, or any Docker
host (it compiles PICT from source, so CPU architecture doesn't matter). Only the
deploy command differs. Render: connect the repo, set **Root Directory** =
`pict-service`, runtime **Docker**, add `ALLOWED_ORIGINS`.

同じ Dockerfile が Render / Fly.io / VPS など任意の Docker ホストで動きます（PICT を
ソースからビルドするので CPU アーキテクチャ非依存）。差はデプロイコマンドだけ。

The container listens on `$PORT` (cloud platforms inject it) and runs as a
non-root user. デプロイ先が注入する `$PORT` で待受け、非 root 実行です。

---

## 5. Wire the GUI to the Service / GUI とサービスの接続

1. Deploy the PICT service ([§4](#4-deploy-the-pict-service--pict-サービスの配備)); note its public HTTPS URL.
2. Build/redeploy the GUI with `VITE_PICT_API_URL=<that URL>` ([§3](#3-deploy-the-gui--gui-の配備)).
3. Verify: open the GUI, choose **Pairwise**, **Generate**. (First request after
   idle may cold-start.) GUI でペアワイズ生成を確認（スリープ明けは初回が遅い）。

The GUI fetches the service cross-origin, so the service must allow the GUI's
origin via `ALLOWED_ORIGINS` ([§6](#6-security--guardrails--セキュリティとガードレール)).

GUI はサービスを別オリジンから呼ぶので、`ALLOWED_ORIGINS` で GUI オリジンを許可します。

---

## 6. Security & Guardrails / セキュリティとガードレール

By design the NeoCombi / NeoCEG APIs are **public and unauthenticated**, and the
PICT service runs **untrusted DSL through a native binary**. The only protections
are guardrails — set them when exposing the service publicly.

設計上 NeoCombi/NeoCEG の API は**公開・無認証**で、PICT サービスは**外部入力をネイティブ
バイナリで実行**します。守りはガードレールのみ。公開時は必ず設定してください。

- **`ALLOWED_ORIGINS`** — restrict CORS to your GUI's origin (instead of `*`).
- **`PICT_TIMEOUT_MS`** — kill a PICT run that exceeds it (default 10 s) → HTTP 504.
- **`MAX_ORDER`** — reject `/generate` orders above it (default 6) — high-strength
  runs are expensive.
- **`RATE_LIMIT_PER_MIN`** — per-IP request cap on the work endpoints → HTTP 429.
- **`MAX_BODY_BYTES`** — request body cap (default 2 MiB).
- **Deploy with a small `--max-instances`** so an abusive burst can't fan out cost.
- The decision-table endpoint is additionally capped at **4096** combinations.

The container already runs as a non-root user, writes each model to an ephemeral
temp dir, and passes PICT arguments as an array (no shell — no command injection).

コンテナは非 root 実行、モデルは一時ディレクトリへ、PICT 引数は配列渡し（シェル非経由＝
コマンドインジェクションなし）。

For deeper notes see [`pict-service/README.md`](../pict-service/README.md).

---

## 7. Configuration Reference / 設定リファレンス

**PICT service / PICT サービス** (environment variables):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 8765 | HTTP listen port (cloud platforms inject this) |
| `NEOCOMBI_PICT_PATH` | `pict` | path to the PICT executable in the container |
| `ALLOWED_ORIGINS` | `*` | comma-separated CORS allowlist; set to your GUI origin |
| `PICT_TIMEOUT_MS` | 10000 | kill a PICT run exceeding this |
| `MAX_ORDER` | 6 | reject `/generate` order above this |
| `RATE_LIMIT_PER_MIN` | 60 | per-IP requests/min on work endpoints (0 = off) |
| `MAX_BODY_BYTES` | 2097152 | request body cap |

**GUI** (build-time):

| Variable | Default | Purpose |
|---|---|---|
| `VITE_PICT_API_URL` | `http://localhost:8765` | PICT service URL baked into the build |

---

## 8. Hosting Samples / サンプルの配信

Sample models are plain `.ncombi` files hosted **outside** the app and opened with
`?file=<url>`. Put them on any static host that sends permissive CORS (GitHub
Pages does). The reference layout mirrors NeoCEG:

サンプルはアプリ**外**に置いた `.ncombi` を `?file=<url>` で開く方式です。CORS を許す
任意の静的ホスト（GitHub Pages 等）に置きます。配置は NeoCEG に倣います：

```
public-files/NeoCombi/Samples/mfp.ncombi
  → https://sho1884.github.io/public-files/NeoCombi/Samples/mfp.ncombi
  → open: https://your-gui/?file=<that url>
```

Link them from your README / docs so users can open them in one click.

---

## 9. CLI in CI/CD / CI-CD での CLI

The CLI runs headless, with **atomic** results (a complete table or nothing;
never a partial file).

CLI は headless で、出力は**原子的**（完全な表か何も出さないか。途中までの
ファイルは作りません）。

```bash
neocombi generate <input.ncombi> [options]
```

| Option | Meaning |
|---|---|
| `--decision-table` | full decision table via the built-in core (no PICT) |
| `--format csv\|tsv\|json` | output format (default csv) |
| `--output <file>` | write to a file instead of stdout |
| `--order <N>` | generation order for pairwise / N-wise |
| `--pict <path>` | path to the PICT executable (pairwise mode) |

**Exit codes** (each meaning is unique tool-wide — branch on them in CI):

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | DSL parse / validation error |
| 2 | PICT invocation failed (pairwise) |
| 3 | input file not found / unreadable |
| 4 | output write failed |
| 5 | decision table too large (> 4096) |

Pairwise via the CLI spawns the PICT binary locally, so the runner needs PICT
installed (or use `--decision-table`, which needs nothing external).

CLI のペアワイズはローカルで PICT を spawn するため、ランナーに PICT が必要です
（`--decision-table` は外部依存なし）。

---

## 10. HTTP API Reference / HTTP API リファレンス

The PICT service is the API for programmatic / CI callers.

| Endpoint | Body | Success response |
|---|---|---|
| `GET /health` | — | `{ ok, available, version, path }` |
| `POST /generate?order=N` | DSL source text | PICT TSV (pairwise) |
| `POST /decision-table` | DSL source text | decision-table JSON |

**`POST /decision-table`** returns exactly one of:

- **200** `{ columns: string[], rows: [{ values: string[], forbidden: boolean }] }`
- **400** `{ reason: "invalid-model", diagnostics }` — the DSL did not parse
- **413** `{ reason: "too-large", count, limit: 4096 }` — over the limit

**`POST /generate`** errors: **400** invalid order / empty body; **502** PICT failed
to launch; **504** PICT timed out; **429** rate-limited. Responses are atomic.

Example:

```bash
curl -sS -X POST --data-binary @model.ncombi \
  https://your-pict-service/decision-table
```

---

## 11. Operations & Troubleshooting / 運用とトラブルシューティング

| Symptom | Cause & fix |
|---|---|
| First request is slow / 初回が遅い | Scale-to-zero cold start — expected on free tiers. Retry; or keep a small minimum instance. |
| Browser console: CORS error / CORS エラー | `ALLOWED_ORIGINS` doesn't include the GUI origin. Set it and redeploy the service. |
| GUI ignores the new service URL / URL が反映されない | `VITE_PICT_API_URL` is **build-time** — rebuild/redeploy the GUI after changing it. |
| `/health` shows `available:false` | The PICT binary isn't runnable in the container — rebuild the image; check the build logs. |
| 504 on `/generate` / 504 が出る | A pathological model hit `PICT_TIMEOUT_MS`. Raise it cautiously, or reduce order/levels. |
| Costs creeping up / コスト増 | Lower `RATE_LIMIT_PER_MIN`, cap `--max-instances`, keep scale-to-zero. |
| 429 responses | Rate limit reached — raise `RATE_LIMIT_PER_MIN` for trusted use, or back off the caller. |

---

## References / 参考

- [User Manual](User_Manual.md) — for people using the tool.
- [`pict-service/README.md`](../pict-service/README.md) — service build, config, and deploy details.
- [Requirements_Specification.md](requirements/Requirements_Specification.md) — UR / SR, incl. the GUI/CLI/API architecture (§4.11).
- [DSL_Grammar_Specification.md](DSL_Grammar_Specification.md) — DSL grammar v1.0.
- [Microsoft PICT](https://github.com/microsoft/pict/blob/main/doc/pict.md) — upstream constraint language & CLI.
