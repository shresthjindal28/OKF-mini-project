/** Backend API contract types (snake_case, exactly as served by FastAPI). */
export const documentTypes = [
  "Guide",
  "Technical specification",
  "Research paper",
  "Meeting notes",
  "Reference",
] as const;

export type DocumentStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "EXTRACTED"
  | "STRUCTURING"
  | "READY"
  | "FAILED";

/** Documents still moving through the pipeline (grouped as "In progress" in the UI). */
export const IN_PROGRESS_STATUSES: DocumentStatus[] = [
  "UPLOADED",
  "PROCESSING",
  "EXTRACTED",
  "STRUCTURING",
];

export type ApiDocument = {
  id: string;
  title: string;
  description: string;
  author: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  status: DocumentStatus;
  document_type: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  error_code: string | null;
  error_message: string | null;
};

export type ApiDocumentDetail = ApiDocument & {
  extracted_text: string | null;
  extracted_metadata: Record<string, unknown>;
  okf_metadata: Record<string, unknown> | null;
};

export type ApiPage = {
  items: ApiDocument[];
  total: number;
  page: number;
  page_size: number;
};

export type ApiStats = {
  total: number;
  ready: number;
  in_progress: number;
  failed: number;
  total_bytes: number;
  indexed_chunks: number;
};

export type ApiJob = {
  id: string;
  document_id: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  stage: string;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

export type ApiOkf = {
  version: string;
  files: Record<string, string>;
  metadata: Record<string, unknown>;
};

export type ApiHit = {
  document_id: string;
  title: string;
  chunk_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

/** UI view model consumed by pages/components (camelCase, derived fields ready). */
export type DocumentRecord = {
  id: string;
  title: string;
  description: string;
  author: string;
  tags: string[];
  documentType: string;
  filename: string;
  fileType: string;
  size: number;
  createdAt: string;
  status: DocumentStatus;
};

export function fileTypeOf(filename: string): string {
  const ext = filename.split(".").pop()?.toUpperCase() ?? "";
  return ext === "MARKDOWN" ? "MD" : ext;
}

export function toRecord(doc: ApiDocument): DocumentRecord {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    author: doc.author,
    tags: doc.tags,
    documentType: doc.document_type,
    filename: doc.original_filename,
    fileType: fileTypeOf(doc.original_filename),
    size: doc.file_size,
    createdAt: doc.created_at,
    status: doc.status,
  };
}

export function formatSize(bytes: number) {
  return bytes < 1048576
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;
}
export function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
