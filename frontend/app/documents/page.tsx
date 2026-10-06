"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useDocuments } from "@/components/documents/document-provider";
import { DocumentTable } from "@/components/documents/document-table";
import { DocumentCard } from "@/components/documents/document-card";
import { api } from "@/lib/api";
import {
  type ApiPage,
  type DocumentRecord,
  documentTypes,
  toRecord,
} from "@/lib/documents";

const PAGE_SIZE = 12;
const STATUS_GROUPS = ["all", "ready", "draft", "failed"] as const;

export default function DocumentsPage() {
  const { loaded } = useDocuments();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("newest");
  const [grid, setGrid] = useState(false);
  const [page, setPage] = useState(1);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [doneKey, setDoneKey] = useState("");
  const [fetchError, setFetchError] = useState("");
  const requestId = useRef(0);

  const requestKey = `${query}|${group}|${type}|${sort}|${page}`;
  const fetching = doneKey !== requestKey;

  // Debounce the search box so typing does not flood the API.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(input.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (!loaded) return;
    const attempt = ++requestId.current;
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
      sort_by: sort === "name" ? "title" : "created_at",
      order: sort === "oldest" ? "asc" : "desc",
    });
    if (query) params.set("search", query);
    if (group !== "all") params.set("status_group", group);
    if (type !== "all") params.set("document_type", type);
    api
      .get<ApiPage>(`/documents?${params.toString()}`, controller.signal)
      .then((data) => {
        if (attempt !== requestId.current) return;
        setDocuments(data.items.map(toRecord));
        setTotal(data.total);
        setFetchError("");
        setDoneKey(requestKey);
      })
      .catch((cause: unknown) => {
        if (attempt !== requestId.current) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setFetchError("Could not load documents. Adjust filters and retry.");
        setDoneKey(requestKey);
      });
    return () => controller.abort();
    // requestKey encodes every dependency that changes the request.
  }, [loaded, requestKey, query, group, type, sort, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <PageHeader
        eyebrow="YOUR LIBRARY"
        title="Documents"
        description="A little less searching. A little more knowing."
      >
        <Button asChild>
          <Link href="/upload">
            <Plus size={17} />
            Upload document
          </Link>
        </Button>
      </PageHeader>
      <div className="library-tabs">
        <span>
          All documents <b>{total}</b>
        </span>
        <span className="muted">Served from your OKF workspace</span>
      </div>
      <div className="filter-bar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search documents"
            placeholder="Search titles, authors, tags…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {input && (
            <button
              aria-label="Clear search"
              onClick={() => setInput("")}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="filter-controls">
          <SlidersHorizontal size={16} />
          <select
            aria-label="Filter by status"
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setPage(1);
            }}
          >
            {STATUS_GROUPS.map((value) => (
              <option key={value} value={value}>
                {value === "all"
                  ? "All statuses"
                  : value === "draft"
                    ? "In progress"
                    : value === "ready"
                      ? "Ready"
                      : "Failed"}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by document type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All types</option>
            {documentTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="Sort documents"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
          <div className="view-toggle">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Table view"
              aria-pressed={!grid}
              onClick={() => setGrid(false)}
            >
              <List size={17} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Card view"
              aria-pressed={grid}
              onClick={() => setGrid(true)}
            >
              <LayoutGrid size={16} />
            </Button>
          </div>
        </div>
      </div>
      {!loaded || (fetching && !documents.length) ? (
        <div className="loading-state" role="status">
          Loading your library…
        </div>
      ) : fetchError && !documents.length ? (
        <div className="error-banner" role="alert">
          {fetchError}
        </div>
      ) : grid && documents.length ? (
        <div className="document-grid">
          {documents.map((doc) => (
            <DocumentCard key={doc.id} document={doc} />
          ))}
        </div>
      ) : (
        <div className="table-container">
          <DocumentTable
            documents={documents}
            filtered={!!query || group !== "all" || type !== "all"}
          />
        </div>
      )}
      {pages > 1 && (
        <div className="pagination">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous page"
            disabled={page <= 1 || fetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={15} />
          </Button>
          <span>
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next page"
            disabled={page >= pages || fetching}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            <ChevronRight size={15} />
          </Button>
        </div>
      )}
      <div className="table-footer">
        <span>
          {documents.length} of {total} documents
        </span>
        <span>Indexed and searchable from your OKF server.</span>
      </div>
    </div>
  );
}
