import { Braces, Info } from "lucide-react";
import type { DocumentRecord } from "@/lib/documents";
export function OkfPreview({ document: doc }: { document: DocumentRecord }) {
  const example = JSON.stringify(
    {
      document: {
        title: doc.title,
        metadata: {
          description: doc.description,
          author: doc.author || "Not specified",
          tags: doc.tags,
          type: doc.documentType,
        },
        source: { name: doc.filename, format: doc.fileType },
        content: "[Document content placeholder]",
      },
    },
    null,
    2,
  );
  return (
    <div>
      <div className="notice">
        <Info size={17} />
        <span>
          <strong>Illustrative preview only.</strong> This is a visual
          placeholder, not an OKF specification or generated OKF file.
        </span>
      </div>
      <div className="code-preview">
        <div className="preview-toolbar">
          <span>
            <Braces size={16} />
            Structure preview
          </span>
          <span>ILLUSTRATIVE</span>
        </div>
        <pre>
          <code>
            {example.split("\n").map((line, i) => (
              <span className="code-row" key={i}>
                <span className="line-number" aria-hidden="true">
                  {i + 1}
                </span>
                <span>{line}</span>
                {"\n"}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
