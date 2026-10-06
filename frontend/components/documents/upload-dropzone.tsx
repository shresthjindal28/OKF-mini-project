"use client";
import { useRef, useState } from "react";
import { UploadCloud, X, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSize } from "@/lib/documents";
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export function UploadDropzone({
  file,
  onFile,
  progress,
  error,
  disabled,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  progress: number;
  error: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept=".pdf,.docx,.md,.markdown,.txt"
        className="sr-only"
        aria-label="Choose a document"
        disabled={disabled}
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {file ? (
        <div className="selected-file">
          <span className="upload-file-icon">
            <FileText size={24} />
          </span>
          <div>
            <strong>{file.name}</strong>
            <p>
              {formatSize(file.size)} <span>·</span>{" "}
              {file.name.split(".").pop()?.toUpperCase()}
            </p>
            <div
              role="progressbar"
              aria-label="Uploading file"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="progress-track"
            >
              <div style={{ width: `${progress}%` }} />
            </div>
            <small>
              {progress === 100
                ? "Upload complete · building OKF…"
                : progress > 0
                  ? `Uploading… ${progress}%`
                  : "File selected · ready to upload"}
            </small>
          </div>
          {progress === 100 && <Check className="success-icon" size={18} />}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Remove file"
            onClick={() => onFile(null)}
          >
            <X size={18} />
          </Button>
        </div>
      ) : (
        <div
          className={`dropzone ${drag ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!disabled) onFile(e.dataTransfer.files[0] ?? null);
          }}
        >
          <span className="dropzone-icon">
            <UploadCloud size={26} />
          </span>
          <h3>Drop your document here</h3>
          <p>or choose a file from your computer</p>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            Browse files
          </Button>
          <small>
            PDF, DOCX, Markdown, or TXT <span>·</span> Up to 10 MB
          </small>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
