import Link from "next/link";
import { ArrowUpRight, Files, Plus } from "lucide-react";
import { type DocumentRecord, formatDate, formatSize } from "@/lib/documents";
import { FileIcon, StatusBadge } from "./document-card";
import { Button } from "@/components/ui/button";
export function DocumentTable({
  documents,
  filtered = false,
}: {
  documents: DocumentRecord[];
  filtered?: boolean;
}) {
  if (!documents.length)
    return (
      <div className="empty-state">
        <Files size={30} />
        <h3>
          {filtered
            ? "No matching documents"
            : "A fresh start for your knowledge"}
        </h3>
        <p>
          {filtered
            ? "Try another search or adjust your filters."
            : "Add your first document to start building your library."}
        </p>
        {!filtered && (
          <Button asChild>
            <Link href="/upload">
              <Plus size={16} />
              Upload document
            </Link>
          </Button>
        )}
      </div>
    );
  return (
    <div className="table-scroll">
      <table className="document-table">
        <thead>
          <tr>
            <th>Document name</th>
            <th>Status</th>
            <th>File type</th>
            <th>Created</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>
                <Link className="document-name" href={`/documents/${doc.id}`}>
                  <FileIcon type={doc.fileType} />
                  <span>
                    <strong>{doc.title}</strong>
                    <small>
                      {doc.documentType} <span>·</span> {formatSize(doc.size)}
                    </small>
                  </span>
                </Link>
              </td>
              <td>
                <StatusBadge status={doc.status} />
              </td>
              <td>
                <span className="file-type-label">{doc.fileType}</span>
              </td>
              <td className="date-cell">{formatDate(doc.createdAt)}</td>
              <td>
                <Button asChild variant="ghost" size="icon">
                  <Link
                    href={`/documents/${doc.id}`}
                    aria-label={`View ${doc.title}`}
                  >
                    <ArrowUpRight size={17} />
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
