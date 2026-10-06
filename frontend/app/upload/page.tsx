"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  ShieldCheck,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  UploadDropzone,
  MAX_FILE_SIZE,
} from "@/components/documents/upload-dropzone";
import {
  MetadataForm,
  metadataSchema,
  type MetadataValues,
} from "@/components/documents/metadata-form";
import { useDocuments } from "@/components/documents/document-provider";
import { ApiError, api } from "@/lib/api";
import type { ApiDocumentDetail } from "@/lib/documents";

export default function UploadPage() {
  const router = useRouter();
  const { addDocument } = useDocuments();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState("");
  const form = useForm<MetadataValues>({
    resolver: zodResolver(metadataSchema),
    defaultValues: {
      title: "",
      description: "",
      author: "",
      tags: "",
      documentType: undefined,
    },
  });

  function selectFile(next: File | null) {
    setError("");
    if (
      next &&
      (!/\.(pdf|docx|md|markdown|txt)$/i.test(next.name) ||
        next.size > MAX_FILE_SIZE ||
        next.size === 0)
    ) {
      setError(
        next.size === 0
          ? "This file is empty. Choose a file with content."
          : next.size > MAX_FILE_SIZE
            ? "This file exceeds the 10 MB limit."
            : "Choose a PDF, DOCX, Markdown, or TXT file.",
      );
      return;
    }
    setFile(next);
    setProgress(0);
    if (next && !form.getValues("title"))
      form.setValue(
        "title",
        next.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
        { shouldValidate: true },
      );
  }

  async function processDocument(id: string) {
    setStatusText("Extracting, structuring, and indexing…");
    try {
      const processed = await api.post<ApiDocumentDetail>(
        `/documents/${id}/process`,
      );
      if (processed.status === "FAILED") {
        router.push(`/documents/${id}?created=1`);
        return;
      }
      router.push(`/documents/${id}?created=1`);
    } catch (cause) {
      // Processing problems are visible on the detail page; never lose the upload.
      const message =
        cause instanceof ApiError
          ? cause.message
          : "Processing could not be started.";
      router.push(`/documents/${id}?created=1&warning=${encodeURIComponent(message)}`);
    }
  }

  async function submit(values: MetadataValues) {
    if (!file) {
      setError("Choose a document before continuing.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await api.upload<ApiDocumentDetail>(
        "/documents",
        file,
        {
          title: values.title,
          description: values.description,
          author: values.author,
          document_type: values.documentType ?? "Reference",
          tags: values.tags
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
            .join(","),
        },
        setProgress,
      );
      addDocument(created);
      setStatusText("Upload complete. Building your OKF…");
      await processDocument(created.id);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setSaving(false);
        return;
      }
      setError(
        cause instanceof ApiError
          ? cause.message
          : "We couldn’t upload this file. Please retry.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} />
        Back to overview
      </Link>
      <PageHeader
        title="Bring your knowledge in."
        description="Start with a document. Give it context. Make it searchable."
      />
      <div className="upload-layout">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit, () => {
              if (!file) setError("Choose a document before continuing.");
            })}
            className="upload-form"
          >
            <section className="form-section">
              <div className="form-section-title">
                <span>1</span>
                <div>
                  <h2>Choose your document</h2>
                  <p>One file is all you need to get started.</p>
                </div>
              </div>
              <UploadDropzone
                file={file}
                onFile={selectFile}
                progress={progress}
                error={error}
                disabled={saving}
              />
            </section>
            <section className="form-section">
              <div className="form-section-title">
                <span>2</span>
                <div>
                  <h2>Add the details</h2>
                  <p>A little context makes your knowledge more useful.</p>
                </div>
              </div>
              <MetadataForm />
            </section>
            <div className="form-actions">
              <span>
                <ShieldCheck size={15} />
                Stored on your OKF server
              </span>
              <Button asChild variant="outline">
                <Link href="/">Cancel</Link>
              </Button>
              <Button
                type="submit"
                disabled={saving}
              >
                {saving ? (
                  <LoaderCircle size={16} className="spin" />
                ) : null}
                {saving
                  ? (statusText || "Saving document…")
                  : "Save & build OKF"}
                {!saving && <ArrowRight size={16} />}
              </Button>
            </div>
          </form>
        </Form>
        <aside className="upload-aside">
          <span className="aside-icon">
            <Info size={20} />
          </span>
          <h3>A document is just the beginning.</h3>
          <p>
            Add the information that helps someone understand what’s inside,
            before they even open it.
          </p>
          <ul>
            <li>
              <Check size={15} />
              Use a clear, specific title
            </li>
            <li>
              <Check size={15} />
              Capture the key idea in a summary
            </li>
            <li>
              <Check size={15} />
              Keep tags short and consistent
            </li>
          </ul>
          <hr />
          <h4>What happens next?</h4>
          <p>
            The server extracts the text, generates a validated OKF bundle, and
            indexes it for semantic search.
          </p>
          <div className="aside-note">
            PDF, DOCX, Markdown, and TXT are processed in place; the original
            file is preserved in every downloaded bundle.
          </div>
          {saving && (
            <div className="notice" role="status" style={{ marginTop: 12 }}>
              <TriangleAlert size={15} />
              Keep this tab open while the document is processed.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
