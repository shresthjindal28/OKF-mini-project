import { FileText } from "lucide-react";
export function DocumentPreview({
  filename,
  fileType,
  content,
}: {
  filename: string;
  fileType: string;
  content: string;
}) {
  return (
    <div className="content-preview">
      <div className="preview-toolbar">
        <span>
          <FileText size={15} />
          {filename}
        </span>
        <span>
          {["PDF", "DOCX"].includes(fileType)
            ? "Extracted text"
            : "Plain text preview"}
        </span>
      </div>
      <article>
        {content
          ? content.split("\n").map((line, i) =>
              line.startsWith("# ") ? (
                <h2 key={i}>{line.slice(2)}</h2>
              ) : line.startsWith("## ") ? (
                <h3 key={i}>{line.slice(3)}</h3>
              ) : line.trim() ? (
                <p key={i}>{line}</p>
              ) : (
                <div className="paragraph-space" key={i} />
              ),
            )
          : null}
      </article>
      <div className="preview-bottom">
        {content
          ? "Text extracted by the server. Formatting and embedded media are not rendered."
          : "No extracted text yet. Process the document to generate content."}
      </div>
    </div>
  );
}
