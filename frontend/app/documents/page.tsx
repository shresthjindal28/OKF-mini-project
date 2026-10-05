"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useDocuments } from "@/components/documents/document-provider";
import { DocumentTable } from "@/components/documents/document-table";
import { DocumentCard } from "@/components/documents/document-card";
export default function DocumentsPage() {
  const { documents, loaded } = useDocuments();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("newest");
  const [grid, setGrid] = useState(false);
  const filtered = documents
    .filter(
      (d) =>
        `${d.title} ${d.author} ${d.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (status === "all" || d.status === status) &&
        (type === "all" || d.fileType === type),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
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
          All documents <b>{documents.length}</b>
        </span>
        <span className="muted">Your browser-local collection</span>
      </div>
      <div className="filter-bar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search documents"
            placeholder="Search documents, tags, authors…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          )}
        </div>
        <div className="filter-controls">
          <SlidersHorizontal size={16} />
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option>Ready</option>
            <option>Draft</option>
          </select>
          <select
            aria-label="Filter by file type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">All file types</option>
            {["PDF", "DOCX", "MD", "TXT"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="Sort documents"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
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
      {!loaded ? (
        <div className="loading-state" role="status">
          Loading your library…
        </div>
      ) : grid && filtered.length ? (
        <div className="document-grid">
          {filtered.map((doc) => (
            <DocumentCard key={doc.id} document={doc} />
          ))}
        </div>
      ) : (
        <div className="table-container">
          <DocumentTable
            documents={filtered}
            filtered={!!query || status !== "all" || type !== "all"}
          />
        </div>
      )}
      <div className="table-footer">
        <span>
          {filtered.length} of {documents.length} documents
        </span>
        <span>Stored locally, ready when you are.</span>
      </div>
    </div>
  );
}
