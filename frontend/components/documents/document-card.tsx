import Link from "next/link";
import { FileText, ArrowUpRight } from "lucide-react";
import { type DocumentRecord, formatDate } from "@/lib/documents";
export function FileIcon({ type }: { type: string }) {
  return (
    <span className={`file-icon file-${type.toLowerCase()}`}>
      <FileText size={21} />
      <span>{type}</span>
    </span>
  );
}
export function StatusBadge({ status }: { status: DocumentRecord["status"] }) {
  return (
    <span className={`status-badge ${status.toLowerCase()}`}>
      <i />
      {status}
    </span>
  );
}
export function DocumentCard({ document: doc }: { document: DocumentRecord }) {
  return (
    <Link href={`/documents/${doc.id}`} className="document-card">
      <div className="card-top">
        <FileIcon type={doc.fileType} />
        <StatusBadge status={doc.status} />
      </div>
      <h3>{doc.title}</h3>
      <p>{doc.description}</p>
      <div className="tag-list">
        {doc.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <div className="card-bottom">
        <span>{formatDate(doc.createdAt)}</span>
        <ArrowUpRight size={16} />
      </div>
    </Link>
  );
}
