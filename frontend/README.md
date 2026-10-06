# OKF Builder — Frontend

Next.js 16 (App Router) client for the OKF Builder backend. It is fully wired to
the FastAPI API in `../backend`: documents, processing, OKF bundles, downloads,
dashboard stats, and semantic search all run over HTTP — there is no local
sample data.

## Getting started

1. Start the backend (see `../backend/README.md`). It needs PostgreSQL with
   pgvector and, for processing, a Hugging Face token.
2. Optionally set the backend origin in `.env` (see `.env.example`):

   ```sh
   API_ORIGIN=http://127.0.0.1:8000
   ```

3. Run the frontend:

   ```sh
   npm install
   npm run dev
   ```

Open http://localhost:3000. All `/api/v1/*` requests are proxied server-side to
`API_ORIGIN`, so the browser stays same-origin and no CORS setup is needed.

## Routes

| Route | Purpose |
|---|---|
| `/` | Dashboard: live stats (counts, storage, indexed chunks) and recent documents |
| `/documents` | Library: debounced server-side search, status/type filters, sorting, pagination, table/card views |
| `/documents/[id]` | Detail: extracted content, real OKF bundle viewer, editable metadata (PATCH), download `.okf.zip`, process/retry with live stage polling, delete |
| `/upload` | Upload with byte-level progress, auto-processing, then redirect to the new document |
| `/search` | Semantic search over the vector index (meaning, not keywords) |

## Architecture notes

- `lib/api.ts` — typed API client: envelope unwrapping, error normalization,
  abort support, XHR upload progress, blob downloads.
- `lib/documents.ts` — backend DTO types and mappers into the camelCase view
  model (`DocumentRecord`); statuses map to all six backend states.
- `components/documents/document-provider.tsx` — React context store backed by
  the API (list, stats, mutations, optimistic stat updates).
- Production flags: `compress`, `poweredByHeader: false`, response gzip and
  `Cache-Control: no-store` handled by the backend.
