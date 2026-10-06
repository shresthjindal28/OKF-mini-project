# OKF Builder backend

Python 3.12+ / FastAPI backend for document-to-OKF conversion and semantic search. No frontend, Next.js routes, chatbot, OpenAI integration, or separate vector service is included.

## Setup (no Docker)

Requires Python 3.12+, [uv](https://docs.astral.sh/uv/), PostgreSQL 15+ with pgvector 0.5+ available, and a Hugging Face token with Inference Providers permission. Direct connections and transaction/session-mode poolers are supported. Processing holds a transaction-scoped advisory lock on a dedicated connection while a second connection commits processing stages. Allow at least two database connections per concurrent processing request; set database/pooler idle-transaction limits above the longest processing duration.

```sh
cd /Users/shresthjindal/Desktop/okf/backend
uv sync --locked
# For a NEW installation only; keep an existing .env intact:
cp -n .env.example .env
# Edit .env with your database/provider credentials.
uv run alembic upgrade head
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The existing `.env` is preserved. `postgres://`, `postgresql://`, and `postgresql+psycopg://` URLs are accepted. URL-encode special characters in passwords. Use `sslmode=require` or your provider's stronger certificate-verification settings for remote PostgreSQL. No secrets are logged or returned in API errors.

For a locally installed PostgreSQL server, create a database and install the extension using a PostgreSQL administrator (skip database creation for an existing hosted database):

```sh
createdb okf
psql -d okf -c 'CREATE EXTENSION IF NOT EXISTS vector;'
```

Install pgvector through your PostgreSQL distribution/package manager or enable it through your managed provider. The migration runs `CREATE EXTENSION IF NOT EXISTS vector`; the migration role needs permission to install extensions or an administrator must enable it first. Use a dedicated application database and separate migration/runtime credentials in production. Runtime needs CRUD access to application tables, read access to `embedding_config` and extension catalog, and advisory-lock permission.

## Configuration

All runtime settings come through Pydantic Settings from environment variables or `.env` in the working directory. Process environment overrides `.env`. See `.env.example` for every setting.

| Variable | Purpose / default |
|---|---|
| `DATABASE_URL` | Required PostgreSQL URL; never committed |
| `HF_TOKEN` | Hugging Face token; required for processing embeddings and search |
| `HF_EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` |
| `HF_EMBEDDING_DIMENSION` | `384`; must match model output; supported range 1–2000 |
| `HF_LLM_MODEL` | Empty disables optional metadata enrichment; otherwise a provider-supported HF model |
| `HF_EMBEDDING_URL` | HF Inference feature-extraction URL template with `{model}` |
| `HF_CHAT_URL` | HF router's structured text-generation endpoint |
| `HF_TIMEOUT_SECONDS`, `HF_MAX_RETRIES` | Per-request timeout 60 seconds; 3 retries for transient errors |
| `HF_BATCH_SIZE` | 16 input texts per embedding request |
| `HF_QUERY_PREFIX`, `HF_DOCUMENT_PREFIX` | Model-specific prefixes; empty by default |
| `HF_LLM_MAX_INPUT_CHARS` | 16000-character metadata excerpt; full source is always retained |
| `STORAGE_PATH` | `./storage`; private persistent filesystem directory |
| `MAX_UPLOAD_SIZE_MB` | 25 MiB maximum source size |
| `MAX_EXTRACTED_CHARS` | 2 million normalized characters |
| `MAX_PDF_PAGES` | 1000 pages; no OCR or encrypted PDFs |
| `MAX_DOCX_UNCOMPRESSED_MB` | 100 MiB ZIP expansion ceiling |
| `CHUNK_SIZE`, `CHUNK_OVERLAP` | Word budgets: 180 and 30, overlap strictly smaller than size |
| `CORS_ORIGINS` | JSON array, e.g. `['http://localhost:3000']`; empty by default; not needed for the bundled Next.js proxy |
| `MAX_CONCURRENT_PROCESSING` | 3 per worker (1–4); excess processing/deletion requests return 503 to preserve connection capacity |
| `DB_POOL_SIZE` | 5 connections per worker (1–100) |
| `DB_MAX_OVERFLOW` | 5 burst connections per worker (0–100) |
| `LOG_LEVEL` | `INFO` |
| `TEST_DATABASE_URL` | Explicit opt-in PostgreSQL URL for integration tests |

Model availability depends on the HF provider/account. Select a model supported for feature extraction and set its exact dimension before the first migration. Configure query/document prefixes when the model requires them. There is no local fake-embedding fallback. Responses must be pooled sentence vectors, one per input; token-level arrays, wrong dimensions, zero vectors and non-finite values fail validation. The client normalizes vectors, batches requests and retries timeouts, rate limits and selected 5xx responses. Provider errors do not expose tokens, raw provider payloads or source content.

The optional LLM endpoint is used only to produce validated title/description/tags. It is **not** a user-facing chat API. Pick a model/provider supporting JSON schema responses. Invalid or unavailable AI output fails the job without removing uploaded source, extracted text, or deterministic OKF. Metadata enrichment uses a bounded excerpt; recorded extraction metadata identifies the model and excerpt length. No AI summaries replace the full document body and no verification is claimed.

## Database and migrations

```sh
uv run alembic upgrade head
uv run alembic current
```

Initial migration creates `documents`, `document_chunks`, `processing_jobs`, `embedding_config`, pgvector, foreign keys with cascading deletion, status/size constraints, list indexes, a unique running-job index and a cosine HNSW vector index. HNSW needs no training and is suitable for a growing corpus; PostgreSQL may prefer an exact scan for small datasets. Approximate search can return fewer filtered hits than requested at scale; tune HNSW search parameters against real recall/latency requirements.

`HF_EMBEDDING_DIMENSION` controls `vector(n)` in the initial migration. `embedding_config` pins model, dimension and prefixes. Startup and search/processing reject incompatible settings. Changing a model—even to another model of the same dimension—requires an explicit maintenance migration and full reindex; do not edit the environment and reuse old vectors. Dimensions above 2000 require a new index design (for example halfvec), not a silent truncation. Never downgrade a database containing needed documents; downgrades delete application tables but preserve the shared extension.

## API

Swagger: `http://localhost:8000/docs`. OpenAPI: `/openapi.json`.

All JSON responses use `{"data": ..., "error": null}` or `{"data": null, "error": {"code": "...", "message": "..."}}`. Download returns ZIP bytes on success and the usual JSON envelope on error.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/documents` | Multipart upload; returns 201 and `UPLOADED` |
| GET | `/api/v1/documents` | Paginated summaries |
| GET | `/api/v1/documents/{id}` | Metadata, extraction, status and last error |
| PATCH | `/api/v1/documents/{id}` | Partial metadata update; regenerates OKF artifacts when present |
| POST | `/api/v1/documents/{id}/process` | Run or retry the complete pipeline synchronously |
| GET | `/api/v1/documents/{id}/jobs` | Most recent 100 processing attempts |
| GET | `/api/v1/documents/{id}/okf` | OKF Markdown files and metadata in an API wrapper |
| GET | `/api/v1/documents/{id}/download` | Portable `.okf.zip` with original source |
| DELETE | `/api/v1/documents/{id}` | Delete document, chunks, jobs, original and generated files |
| GET | `/api/v1/stats` | Dashboard aggregates: status counts, total bytes, indexed chunks |
| POST | `/api/v1/search` | Matching chunks and cosine similarities; no generated answer |
| GET | `/health/live` | Process liveness |
| GET | `/health/ready` | PostgreSQL, pgvector and embedding configuration readiness |

List query parameters: `page` (1-based), `page_size` (1–100), `search` (literal substring across title, author, description and tags; backed by trigram indexes from migration `0002`), `status`, `status_group` (`ready`, `draft`, `failed`), `document_type`, `sort_by` (`created_at`, `updated_at`, `title`) and `order` (`asc`, `desc`). Sort fields are allowlisted and queries use SQLAlchemy parameters.

```sh
curl -F 'file=@guide.md;type=text/markdown' \
  -F 'title=Knowledge guide' -F 'document_type=Guide' \
  -F 'author=Example Author' -F 'tags=knowledge' -F 'tags=guide' \
  http://localhost:8000/api/v1/documents

# Replace UUID with the id returned by upload.
curl -X POST http://localhost:8000/api/v1/documents/UUID/process
curl 'http://localhost:8000/api/v1/documents?page=1&page_size=20&status=READY&sort_by=created_at&order=desc'
curl http://localhost:8000/api/v1/documents/UUID/okf
curl -f -o knowledge.okf.zip http://localhost:8000/api/v1/documents/UUID/download
curl -H 'Content-Type: application/json' \
  -d '{"query":"knowledge organization","limit":10}' \
  http://localhost:8000/api/v1/search
curl -X DELETE http://localhost:8000/api/v1/documents/UUID
```

A search request may also include `document_id`. Similarity is cosine similarity in [-1, 1], not a calibrated confidence or truth score.

### Frontend integration

The Next.js frontend in `../frontend` is wired to this API: it proxies `/api/v1/*` through its own origin (`API_ORIGIN`, default `http://127.0.0.1:8000`), so no CORS configuration is required for the bundled setup. It consumes uppercase backend statuses (`UPLOADED`, `PROCESSING`, `EXTRACTED`, `STRUCTURING`, `READY`, `FAILED`) and maps snake_case API properties to its camelCase display model: `original_filename → filename`, `file_size → size`, `document_type → documentType`, `created_at → createdAt`, `extracted_text → content`. Upload and process are separate requests; the UI polls document detail and jobs while processing.

## Document → OKF → index → search

1. Upload: validate extension, declared MIME, signatures/package structure, encoding and size. UUID-based paths prevent client filenames from determining storage paths. Text supports UTF-8 and BOM-marked UTF-16. DOCX archives are checked for expansion, traversal, encryption and macros; files are never executed.
2. Extract: pypdf extracts PDF text/metadata; python-docx preserves headings and table order; Markdown/TXT retain their content. Empty, image-only or corrupt documents report useful errors. Extraction limits bound accepted input/output; scanned PDFs need external OCR.
3. Structure: persist extraction and generate deterministic OKF first. Optionally ask HF for validated descriptive metadata. User-provided metadata takes precedence.
4. Generate: portable UTF-8 Markdown and YAML frontmatter; store a database snapshot and separate generated ZIP. Source originals are in `storage/originals/`; generated output is in `storage/generated/`.
5. Chunk: preserve headings and paragraphs where possible; split large blocks at sentence/line boundaries, falling back to word windows. Use bounded overlap within a section. Very long code/tables can be split; chunk metadata retains the section and concept path.
6. Embed/index: generate and validate HF vectors. Atomically replace document chunks and mark the job/document ready. Search only includes `READY` documents.
7. Search: embed the query in the same model space, order pgvector cosine distances, and return actual matching text plus document/chunk identifiers, metadata and scores.

Processing runs in a FastAPI worker thread during the `/process` request, with no Redis/Celery and no nondurable fire-and-forget queue. Configure reverse-proxy timeouts for long documents. Stages commit independently; transaction-scoped advisory locks prevent duplicate processing/deletion. A crashed process may leave a RUNNING job visible; retry `/process` after the old connection releases its lock to mark that attempt interrupted and start a new one. Retrying replaces vectors atomically. A failed reprocessing attempt is excluded from search until repaired. `ProcessingService` can later be run by a durable worker without rewriting routes or core services.

## OKF conformance

Source of truth: [GoogleCloudPlatform/open-knowledge-format SPEC.md, v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md), reviewed 2026-10-05. In particular: concept/frontmatter §4, sources/trust/lifecycle §5, indexes §8, conformance §11 and version declaration §12. This project does not invent a JSON OKF specification. `OKFRepresentation` is an HTTP envelope for portable files, not an official OKF object schema.

Each export contains:

```text
index.md            # root index with okf_version: "0.2"
document.md         # concept with type + YAML metadata + complete extracted text
assets/source.*     # exact original bytes (raw .md uses source.md.txt)
```

The original uploaded Markdown is stored with a `.txt` suffix in the archive because an arbitrary raw Markdown file may not be an OKF concept. The concept's `sources` points to the included original. `generated.by` identifies the automated builder and `generated.at` includes an explicit UTC offset. Generated concepts use lifecycle `draft` and omit `verified`; backend processing status READY means indexing finished, not that a human reviewed the knowledge. Consumer validation accepts unknown types/extensions, missing optional metadata and broken links, and normalizes a single `verified` mapping to a list. Optional metadata is not a new conformance gate. Source bodies and unknown YAML fields survive load/serialize round trips; this is a semantic round trip, not comment/format preservation. No computation is executed or automatically claimed to be attested.

The database and vectors are not needed to read an exported bundle. Storage is behind a `Storage` protocol so an S3/R2 adapter can replace local storage later. Back up PostgreSQL and the original-files directory together. Downloads are reconstructed from committed OKF and originals, avoiding dependence on a stale generated ZIP after a partial failure.

## Tests and verification

```sh
uv run pytest -m 'not integration'
uv run ruff check .
uv run ruff format --check .
uv run mypy app

# Prefer a separate database; migrate it with the same embedding settings.
DATABASE_URL="$TEST_DATABASE_URL" uv run alembic upgrade head
# TEST_DATABASE_URL is an explicit opt-in; integration tests never truncate tables.
uv run pytest
```

Unit tests require a syntactically valid DATABASE_URL but no database connection or HF access. Integration tests require a migrated `TEST_DATABASE_URL`; they use real PostgreSQL/pgvector and mocked HF HTTP responses, create UUID test records and delete only their own records. They exercise PDF/DOCX/MD/TXT uploads, extraction, processing, ZIP download, vectors, search, retry, failure preservation, filters, locking and cascading deletion. HF contract tests exercise request batching, output validation, retries and structured response validation without making real inference calls.

Run behind TLS and an access-controlled reverse proxy when exposed outside a trusted environment. Authentication is intentionally absent. Set proxy connection/time limits and request-rate limits, monitor provider costs, and keep parsers updated. File validation and extraction limits are not a full malware scanner or parser sandbox; for hostile public uploads, run extraction in an OS-sandboxed worker with CPU/memory limits. Multi-instance deployments need shared persistent storage or an object-storage adapter. Failed filesystem cleanup after a committed deletion is logged as `storage_cleanup_failed` and requires operational cleanup of that document's UUID directories. Crashes during upload can leave orphaned files; reconcile backups/storage periodically.

## Layout

```text
backend/
  app/
    main.py
    api/          documents.py, okf.py, search.py, dependencies.py
    core/         config.py, database.py, errors.py, logging.py, middleware.py
    models/       document.py, document_chunk.py, processing_job.py, embedding_config.py
    schemas/      common.py, document.py, okf.py, search.py
    services/     document_service.py, extraction_service.py, okf_service.py,
                  chunking_service.py, embedding_service.py, search_service.py
    ai/           huggingface_client.py, prompts.py
    utils/        files.py, validation.py
  migrations/versions/0001_initial.py
  storage/
  tests/
  .env.example
  alembic.ini
  pyproject.toml
  uv.lock
  README.md
```
