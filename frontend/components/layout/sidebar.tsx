"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  Files,
  LayoutGrid,
  Plus,
  ChevronsUpDown,
  Layers2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDocuments } from "@/components/documents/document-provider";
export function Sidebar({ open, close }: { open: boolean; close: () => void }) {
  const path = usePathname();
  const { stats } = useDocuments();
  return (
    <>
      <div
        className={`sidebar-overlay ${open ? "visible" : ""}`}
        onClick={close}
      />
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <Link href="/" className="brand" onClick={close}>
          <span className="brand-mark">
            <Layers2 size={23} />
          </span>
          <span>
            okf<span className="brand-suffix"> / builder</span>
          </span>
        </Link>
        <button
          className="mobile-close"
          onClick={close}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
        <div className="workspace">
          <span className="workspace-avatar">P</span>
          <span>
            Personal workspace<small>OKF workspace</small>
          </span>
          <ChevronsUpDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            { href: "/", label: "Overview", icon: LayoutGrid },
            { href: "/documents", label: "Documents", icon: Files },
            { href: "/search", label: "Semantic search", icon: Search },
            { href: "/upload", label: "Upload document", icon: Plus },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              onClick={close}
              key={href}
              href={href}
              className={`nav-link ${(href === "/" ? path === href : path.startsWith(href)) ? "active" : ""}`}
            >
              <Icon size={18} />
              {label}
              {href === "/documents" && stats && (
                <span className="nav-count">{stats.total}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="open-note">
            <span className="small-logo">
              <BookOpen size={17} />
            </span>
            <strong>Knowledge, made portable.</strong>
            <p>
              Your documents. Your context.
              <br />
              An open place to start.
            </p>
            <Link href="/upload" onClick={close}>
              Build your first OKF <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="local-status">
            <span />
            Connected to OKF server <span className="version">v0.2</span>
          </div>
          <Button asChild variant="ghost" className="profile">
            <Link href="/documents" onClick={close}>
              <span className="avatar">P</span>
              <span>
                Personal workspace<small>OKF Builder</small>
              </span>
            </Link>
          </Button>
        </div>
      </aside>
    </>
  );
}
