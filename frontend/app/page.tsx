"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Files,
  CheckCheck,
  PencilLine,
  HardDrive,
  Braces,
  Upload,
  FileText,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useDocuments } from "@/components/documents/document-provider";
import { DocumentTable } from "@/components/documents/document-table";
import { formatSize } from "@/lib/documents";
export default function Home() {
  const { documents, stats, loaded } = useDocuments();
  const ready = stats?.ready ?? 0;
  return (
    <div className="page dashboard">
      <PageHeader
        eyebrow="YOUR KNOWLEDGE WORKSPACE"
        title="A home for your knowledge."
        description="Turn everyday documents into organized, portable knowledge."
      >
        <Button asChild>
          <Link href="/upload">
            <Plus size={17} />
            Upload document
          </Link>
        </Button>
      </PageHeader>
      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="section-kicker">
            <span />
            OPEN BY DESIGN
          </span>
          <h2>
            Good knowledge deserves
            <br />a little structure.
          </h2>
          <p>
            Bring your documents together. Add context, review the details,
            <br className="desktop-break" /> and explore what structured
            knowledge can look like.
          </p>
          <Button asChild variant="outline">
            <Link href="/upload">
              Build your first document <ArrowRight size={16} />
            </Link>
          </Button>
          <span className="supported-formats">PDF, DOCX, Markdown & TXT</span>
        </div>
        <div className="structure-art" aria-hidden="true">
          <div className="art-grid" />
          <div className="art-source">
            <span className="art-file">
              <FileText size={25} />
            </span>
            <div>
              <span className="art-line long" />
              <span className="art-line" />
            </div>
            <span className="art-source-label">your-document.md</span>
          </div>
          <div className="art-connector">
            <ArrowRight size={22} />
          </div>
          <div className="art-code">
            <div className="art-code-head">
              <Braces size={17} />
              <span>A more connected format</span>
              <span className="art-dot" />
            </div>
            <div className="code-lines">
              <p>{"{"}</p>
              <p>
                &nbsp; <b>&quot;document&quot;</b>: {"{"}
              </p>
              <p>
                &nbsp; &nbsp; <b>&quot;title&quot;</b>:{" "}
                <em>&quot;Your knowledge&quot;</em>,
              </p>
              <p>
                &nbsp; &nbsp; <b>&quot;metadata&quot;</b>: {"{ ... }"},
              </p>
              <p>
                &nbsp; &nbsp; <b>&quot;content&quot;</b>: [ ... ]
              </p>
              <p>&nbsp; {"}"}</p>
              <p>{"}"}</p>
            </div>
          </div>
          <span className="art-caption">
            <ShieldCheck size={13} />
            Your content. More context.
          </span>
        </div>
      </section>
      <section className="stats-grid" aria-label="Document statistics">
        {[
          {
            label: "Total documents",
            value: stats?.total ?? 0,
            icon: Files,
            note: "In your workspace",
          },
          {
            label: "Ready & indexed",
            value: ready,
            icon: CheckCheck,
            note: "Searchable in the vector index",
            color: "green",
          },
          {
            label: "In progress",
            value: stats?.in_progress ?? 0,
            icon: PencilLine,
            note: "Uploaded or processing",
            color: "orange",
          },
          {
            label: "Source file size",
            value: formatSize(stats?.total_bytes ?? 0),
            icon: HardDrive,
            note: `${stats?.indexed_chunks ?? 0} chunks indexed`,
          },
        ].map(({ label, value, icon: Icon, note, color }) => (
          <div className="stat" key={label}>
            <div className="stat-label">
              {label}
              <Icon size={17} />
            </div>
            <strong>{loaded ? value : "—"}</strong>
            <span className={color}>
              {color && <i />}
              {note}
            </span>
          </div>
        ))}
      </section>
      <section className="recent-section">
        <div className="section-heading">
          <div>
            <h2>
              Recent documents{" "}
              <span className="count-badge">{stats?.total ?? 0}</span>
            </h2>
            <p>Your latest additions, all in one place.</p>
          </div>
          <Link className="text-link" href="/documents">
            View all documents <ArrowRight size={15} />
          </Link>
        </div>
        <div className="table-container">
          {loaded ? (
            <DocumentTable documents={documents.slice(0, 5)} />
          ) : (
            <div className="loading-state" role="status">
              Loading your documents…
            </div>
          )}
        </div>
      </section>
      <section className="workflow-section">
        <div className="section-heading">
          <h2>A simple path from document to knowledge</h2>
          <span className="muted">Three steps. One organized workspace.</span>
        </div>
        <div className="workflow-grid">
          {[
            {
              n: "01",
              icon: Upload,
              title: "Bring your document",
              text: "Start with a PDF, Word document, or plain text file.",
            },
            {
              n: "02",
              icon: FileText,
              title: "Add a little context",
              text: "A title, a few tags, and the details that matter.",
            },
            {
              n: "03",
              icon: Braces,
              title: "Get the structure",
              text: "A validated OKF bundle, extracted text, and a semantic index.",
            },
          ].map(({ n, icon: Icon, title, text }) => (
            <div className="workflow-item" key={n}>
              <span className="workflow-icon">
                <Icon size={19} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              <span className="step-number">{n}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="demo-note">
        <span>
          <span className="demo-dot" />
          <Layers size={13} /> Powered by OKF v0.2
        </span>
        <p>
          Every uploaded document becomes a portable, validated OKF bundle with
          semantic search built in.
        </p>
        <Link href="/documents">
          Explore library
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  );
}
