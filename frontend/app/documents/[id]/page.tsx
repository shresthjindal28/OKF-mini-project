"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  ArrowLeft,
  Download,
  Trash2,
  CheckCircle2,
  Info,
  FileText,
  Braces,
  Tags,
} from "lucide-react";
import { useDocuments } from "@/components/documents/document-provider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { FileIcon, StatusBadge } from "@/components/documents/document-card";
import { DocumentPreview } from "@/components/documents/document-preview";
import { OkfPreview } from "@/components/documents/okf-preview";
import { formatDate, formatSize } from "@/lib/documents";
export default function DocumentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { documents, loaded, deleteDocument } = useDocuments();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const doc = documents.find((d) => d.id === id);
  const [created] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("created") === "1",
  );
  if (!loaded)
    return (
      <div className="page loading-state" role="status">
        Loading document…
      </div>
    );
  if (!doc)
    return (
      <div className="page empty-state">
        <FileText size={32} />
        <h1>Document not found</h1>
        <p>It may have been removed or saved in another browser.</p>
        <Button asChild>
          <Link href="/documents">Back to documents</Link>
        </Button>
      </div>
    );
  return (
    <div className="page">
      <Link className="back-link" href="/documents">
        <ArrowLeft size={15} />
        Back to documents
      </Link>
      {created && (
        <div className="notice success" role="status">
          <CheckCircle2 size={18} />
          Document saved. Your local preview is ready to review.
        </div>
      )}
      <PageHeader
        title={doc.title}
        description={doc.description || "No description added."}
      >
        <Button
          variant="outline"
          onClick={() =>
            setMessage(
              "OKF downloads will be available when generation is implemented. This preview does not produce an OKF file.",
            )
          }
        >
          <Download size={16} />
          Download OKF
        </Button>
        <AlertDialog.Root>
          <AlertDialog.Trigger asChild>
            <Button variant="outline" size="icon" aria-label="Delete document">
              <Trash2 size={16} />
            </Button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="dialog-overlay" />
            <AlertDialog.Content className="dialog-content">
              <AlertDialog.Title>Delete this document?</AlertDialog.Title>
              <AlertDialog.Description>
                “{doc.title}” will be removed from this browser’s workspace.
                Your original file will remain on your device.
              </AlertDialog.Description>
              <div className="dialog-actions">
                <AlertDialog.Cancel asChild>
                  <Button variant="outline">Keep document</Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      deleteDocument(id);
                      router.push("/documents");
                    }}
                  >
                    Delete document
                  </Button>
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </PageHeader>
      {message && (
        <div className="notice" role="status">
          <Info size={17} />
          {message}
        </div>
      )}
      <div className="detail-meta-line">
        <StatusBadge status={doc.status} />
        <span>{doc.documentType}</span>
        <span>Created {formatDate(doc.createdAt)}</span>
        <span>By {doc.author || "Unknown author"}</span>
      </div>
      <div className="detail-layout">
        <Tabs defaultValue="content">
          <TabsList aria-label="Document views">
            <TabsTrigger value="content">
              <FileText size={16} />
              Content
            </TabsTrigger>
            <TabsTrigger value="structure">
              <Braces size={16} />
              OKF structure
            </TabsTrigger>
            <TabsTrigger value="metadata">
              <Tags size={16} />
              Metadata
            </TabsTrigger>
          </TabsList>
          <TabsContent value="content">
            <DocumentPreview document={doc} />
          </TabsContent>
          <TabsContent value="structure">
            <OkfPreview document={doc} />
          </TabsContent>
          <TabsContent value="metadata">
            <div className="metadata-panel">
              <h2>Document metadata</h2>
              <dl>
                {[
                  ["Title", doc.title],
                  ["Description", doc.description || "Not provided"],
                  ["Author", doc.author || "Not provided"],
                  ["Document type", doc.documentType],
                  ["Created", formatDate(doc.createdAt)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <h4>Tags</h4>
              <div className="tag-list">
                {doc.tags.length ? (
                  doc.tags.map((tag) => <span key={tag}>{tag}</span>)
                ) : (
                  <p className="muted">No tags added</p>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <aside className="detail-aside">
          <h3>Original document</h3>
          <div className="original-file">
            <FileIcon type={doc.fileType} />
            <strong>{doc.filename}</strong>
          </div>
          <dl>
            <div>
              <dt>Format</dt>
              <dd>{doc.fileType}</dd>
            </div>
            <div>
              <dt>File size</dt>
              <dd>{formatSize(doc.size)}</dd>
            </div>
            <div>
              <dt>Added</dt>
              <dd>{formatDate(doc.createdAt)}</dd>
            </div>
          </dl>
          <hr />
          <h3>Tags</h3>
          <div className="tag-list">
            {doc.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
            {!doc.tags.length && <p className="muted">No tags added</p>}
          </div>
          <div className="aside-note">
            This browser stores metadata and a text preview. Original file
            binaries are not retained. Sample documents contain illustrative
            content.
          </div>
        </aside>
      </div>
    </div>
  );
}
