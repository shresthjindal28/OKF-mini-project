import { FileText } from "lucide-react";
import type { DocumentRecord } from "@/lib/documents";
export function DocumentPreview({
  document: doc,
}: {
  document: DocumentRecord;
}) {
  return (
    <div className="content-preview">
      <div className="preview-toolbar">
        <span>
          <FileText size={15} />
          {doc.filename}
        </span>
        <span>
          {["PDF", "DOCX"].includes(doc.fileType)
            ? "Sample / text preview"
            : "Plain text preview"}
        </span>
      </div>
      <article>
        {doc.content
          .split("\n")
          .map((line, i) =>
            line.startsWith("# ") ? (
              <h2 key={i}>{line.slice(2)}</h2>
            ) : line.startsWith("## ") ? (
              <h3 key={i}>{line.slice(3)}</h3>
            ) : line.trim() ? (
              <p key={i}>{line}</p>
            ) : (
              <div className="paragraph-space" key={i} />
            ),
          )}
      </article>
      <div className="preview-bottom">
        Text is displayed as provided. Formatting and embedded media are not
        rendered.
      </div>
    </div>
  );
}
