"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, Sparkles, TriangleAlert, FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { type ApiHit } from "@/lib/documents";

const MIN_QUERY = 2;

export default function SearchPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ApiHit[]>([]);
  const [doneQuery, setDoneQuery] = useState("");
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const requestId = useRef(0);

  const searching = query !== "" && query !== doneQuery;

  // Debounce semantic searches; the embedding call is expensive server-side.
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = input.trim();
      setQuery(trimmed.length >= MIN_QUERY ? trimmed : "");
    }, 450);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (!query) return;
    const attempt = ++requestId.current;
    const controller = new AbortController();
    api
      .post<ApiHit[]>("/search", { query, limit: 20 }, controller.signal)
      .then((data) => {
        if (attempt !== requestId.current) return;
        setHits(data);
        setError("");
        setSearched(true);
        setDoneQuery(query);
      })
      .catch((cause: unknown) => {
        if (attempt !== requestId.current) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setHits([]);
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : "Search is unavailable right now.",
        );
        setSearched(true);
        setDoneQuery(query);
      });
    return () => controller.abort();
  }, [query]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="SEMANTIC SEARCH"
        title="Ask your library anything."
        description="Search by meaning across every indexed document, not just keywords."
      />
      <div className="filter-bar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Semantic search"
            placeholder="e.g. how do we keep knowledge portable?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          {input && (
            <button aria-label="Clear search" onClick={() => setInput("")}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {searching && (
        <div className="loading-state" role="status">
          Searching your library…
        </div>
      )}
      {!searching && error && (
        <div className="error-banner" role="alert">
          <TriangleAlert size={17} />
          {error}
        </div>
      )}
      {!searching && searched && !hits.length && !error && (
        <div className="empty-state">
          <FileText size={30} />
          <h3>No meaningful matches</h3>
          <p>
            Try different wording, or upload and process more documents — only
            READY documents are searchable.
          </p>
          <Button asChild>
            <Link href="/upload">Upload document</Link>
          </Button>
        </div>
      )}
      {!searching && hits.length > 0 && (
        <div className="search-layout">
          <div className="library-tabs">
            <span>
              <b>{hits.length}</b> passages matched by meaning
            </span>
            <span className="muted">Ranked by embedding similarity</span>
          </div>
          {hits.map((hit) => (
            <Link
              key={hit.chunk_id}
              href={`/documents/${hit.document_id}`}
              className="hit-card"
            >
              <span
                className="hit-similarity"
                style={
                  { "--sim": `${Math.round(hit.similarity * 100)}%` } as React.CSSProperties
                }
              >
                <Sparkles size={12} />
                {Math.round(hit.similarity * 100)}% match
                <i aria-hidden="true" />
              </span>
              <h3>{hit.title}</h3>
              <p className="hit-content">
                {hit.content.length > 320
                  ? `${hit.content.slice(0, 320)}…`
                  : hit.content}
              </p>
            </Link>
          ))}
        </div>
      )}
      {!query && !input && (
        <div className="empty-state">
          <Sparkles size={30} />
          <h3>Search by meaning</h3>
          <p>
            Type at least {MIN_QUERY} characters. Results come from the vector
            index of every processed document.
          </p>
        </div>
      )}
    </div>
  );
}
