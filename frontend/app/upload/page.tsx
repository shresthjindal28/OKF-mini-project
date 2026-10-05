"use client";
import { useEffect, useState } from "react";
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
export default function UploadPage() {
  const router = useRouter();
  const { addDocument } = useDocuments();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
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
  useEffect(() => {
    if (!file) return;
    const timer = setInterval(
      () => setProgress((p) => Math.min(100, p + 25)),
      120,
    );
    return () => clearInterval(timer);
  }, [file]);
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
  async function submit(values: MetadataValues) {
    if (!file) {
      setError("Choose a document before continuing.");
      return;
    }
    if (progress < 100) return;
    setSaving(true);
    try {
      const ext = file.name.split(".").pop()?.toUpperCase() ?? "TXT";
      const textFile = ["TXT", "MD", "MARKDOWN"].includes(ext);
      const content = textFile
        ? (await file.text()).slice(0, 100000)
        : "A text preview is not available for this file type in the frontend demo. The original file has not been parsed. You can review its metadata and illustrative structure in the other tabs.";
      const id = crypto.randomUUID();
      addDocument({
        ...values,
        id,
        tags: [
          ...new Set(
            values.tags
              .split(",")
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean),
          ),
        ],
        filename: file.name,
        fileType: ext === "MARKDOWN" ? "MD" : ext,
        size: file.size,
        createdAt: new Date().toISOString(),
        status: "Ready",
        content,
      });
      router.push(`/documents/${id}?created=1`);
    } catch {
      setError("We couldn’t read this file. Please select it again and retry.");
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
        description="Start with a document. Give it context. Make it easier to find."
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
                Saved to this browser only
              </span>
              <Button asChild variant="outline">
                <Link href="/">Cancel</Link>
              </Button>
              <Button
                type="submit"
                disabled={saving || (!!file && progress < 100)}
              >
                {saving ? <LoaderCircle size={16} className="spin" /> : null}
                {saving ? "Saving document…" : "Save & review"}
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
            You’ll review your document and see an illustrative OKF structure
            preview.
          </p>
          <div className="aside-note">
            This is a frontend workspace. Files stay on your device; no OKF
            generation or document processing takes place.
          </div>
        </aside>
      </div>
    </div>
  );
}
