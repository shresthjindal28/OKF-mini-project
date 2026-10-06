"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Download,
  Trash2,
  CheckCircle2,
  FileText,
  Braces,
  Tags,
  LoaderCircle,
  Play,
  TriangleAlert,
  Check,
} from "lucide-react";
import { useDocuments } from "@/components/documents/document-provider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/layout/page-header";
import { FileIcon, StatusBadge } from "@/components/documents/document-card";
import { DocumentPreview } from "@/components/documents/document-preview";
import { OkfPreview } from "@/components/documents/okf-preview";
import {
  MetadataForm,
  metadataSchema,
  type MetadataValues,
} from "@/components/documents/metadata-form";
import { ApiError, api, saveBlob } from "@/lib/api";
import {
  type ApiDocumentDetail,
  type ApiJob,
  type ApiOkf,
  formatDate,
  formatSize,
} from "@/lib/documents";

const TRANSITIONAL = new Set(["PROCESSING", "EXTRACTED", "STRUCTURING"]);

export default function DocumentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { deleteDocument, updateDocument, refresh } = useDocuments();

  const [detail, setDetail] = useState<ApiDocumentDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [stage, setStage] = useState("");
  const [working, setWorking] = useState(false); // process/retry in flight
  const [actionError, setActionError] = useState("");
  const [tab, setTab] = useState("content");

  // Post-upload redirects carry ?created=1 and an optional processing warning.
  const [created] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("created") === "1",
  );
  const [uploadWarning] = useState(
    () =>
      (typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("warning")) ||
      "",
  );

  // OKF bundle state, (re)loaded whenever the structure tab opens and the document changed.
  const [okf, setOkf] = useState<ApiOkf | null>(null);
  const [okfFor, setOkfFor] = useState("");
  const [okfError, setOkfError] = useState("");
  const okfStamp = detail?.updated_at ?? "";
  const okfLoading = tab === "structure" && okfStamp !== "" && okfFor !== okfStamp;

  // Metadata edit form.
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
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
    const controller = new AbortController();
    api
      .get<ApiDocumentDetail>(`/documents/${id}`, controller.signal)
      .then((data) => {
        setDetail(data);
        form.reset({
          title: data.title,
          description: data.description,
          author: data.author,
          tags: data.tags.join(", "),
          documentType: data.document_type as MetadataValues["documentType"],
        });
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 404) setNotFound(true);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const poll = useCallback(async () => {
    try {
      const next = await api.get<ApiDocumentDetail>(`/documents/${id}`);
      setDetail(next);
      setActionError("");
      if (next.status === "READY" || next.status === "FAILED") {
        setWorking(false);
        void refresh();
        if (next.status === "READY") {
          setOkf(null);
          setOkfFor("");
        }
      }
    } catch {
      // Transient poll failures are ignored; the next tick retries.
    }
  }, [id, refresh]);

  const active = detail !== null && (working || TRANSITIONAL.has(detail.status));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      void poll();
      api
        .get<ApiJob[]>(`/documents/${id}/jobs`)
        .then((jobs) => jobs[0] && setStage(jobs[0].stage))
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [active, id, poll]);

  // Lazy-load the OKF bundle when the structure tab is visible.
  useEffect(() => {
    if (tab !== "structure" || !okfStamp || okfFor === okfStamp) return;
    let cancelled = false;
    const controller = new AbortController();
    api
      .get<ApiOkf>(`/documents/${id}/okf`, controller.signal)
      .then((data) => {
        if (cancelled) return;
        setOkf(data);
        setOkfError("");
        setOkfFor(okfStamp);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setOkf(null);
        setOkfError(
          cause instanceof ApiError
            ? cause.message
            : "The OKF bundle could not be loaded.",
        );
        setOkfFor(okfStamp);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tab, okfStamp, okfFor, id]);

  if (notFound)
    return (
      <div className="page empty-state">
        <FileText size={32} />
        <h1>Document not found</h1>
        <p>It may have been removed from the workspace.</p>
        <Button asChild>
          <Link href="/documents">Back to documents</Link>
        </Button>
      </div>
    );
  if (!detail)
    return (
      <div className="page loading-state" role="status">
        Loading document…
      </div>
    );

  const doc = {
    id: detail.id,
    title: detail.title,
    description: detail.description,
    author: detail.author,
    tags: detail.tags,
    documentType: detail.document_type,
    filename: detail.original_filename,
    fileType: detail.original_filename.split(".").pop()?.toUpperCase() ?? "",
    size: detail.file_size,
    createdAt: detail.created_at,
    status: detail.status,
  };

  async function process() {
    setWorking(true);
    setActionError("");
    try {
      const next = await api.post<ApiDocumentDetail>(`/documents/${id}/process`);
      setDetail(next);
      setOkf(null);
      setOkfFor("");
      void refresh();
    } catch (cause) {
      setWorking(false);
      setActionError(
        cause instanceof ApiError
          ? cause.message
          : "Processing could not be started.",
      );
    }
  }

  async function download() {
    setActionError("");
    try {
      const blob = await api.download(`/documents/${id}/download`);
      const safe = doc.title.replace(/[^\w.-]+/g, "-").slice(0, 60) || "document";
      saveBlob(blob, `${safe}.okf.zip`);
    } catch (cause) {
      setActionError(
        cause instanceof ApiError
          ? cause.message
          : "The OKF bundle could not be downloaded.",
      );
    }
  }

  async function remove() {
    try {
      await deleteDocument(id);
      router.push("/documents");
    } catch (cause) {
      setActionError(
        cause instanceof ApiError ? cause.message : "The document could not be deleted.",
      );
    }
  }

  async function saveMetadata(values: MetadataValues) {
    setSaved(false);
    setSaveError("");
    try {
      const updated = await updateDocument(id, {
        title: values.title,
        description: values.description,
        author: values.author,
        document_type: values.documentType,
        tags: values.tags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      });
      setDetail((current) => (current ? { ...current, ...updated } : updated));
      setOkf(null);
      setOkfFor("");
      setSaved(true);
    } catch (cause) {
      setSaveError(
        cause instanceof ApiError ? cause.message : "Changes could not be saved.",
      );
    }
  }

  return (
    <div className="page">
      <Link className="back-link" href="/documents">
        <ArrowLeft size={15} />
        Back to documents
      </Link>
      {created && (
        <div className="notice success" role="status">
          <CheckCircle2 size={18} />
          Document saved to your OKF workspace.
        </div>
      )}
      {uploadWarning && (
        <div className="error-banner" role="alert">
          <TriangleAlert size={17} />
          {uploadWarning}
        </div>
      )}
      {actionError && (
        <div className="error-banner" role="alert">
          <TriangleAlert size={17} />
          {actionError}
        </div>
      )}
      <PageHeader title={doc.title} description={doc.description || "No description added."}>
        {detail.status === "UPLOADED" || detail.status === "FAILED" ? (
          <Button onClick={() => void process()} disabled={working}>
            {working ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Play size={15} />
            )}
            {detail.status === "FAILED" ? "Retry processing" : "Process document"}
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => void download()}>
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
                “{doc.title}” will be removed from the workspace, including its
                extracted text, search index, and OKF bundle.
              </AlertDialog.Description>
              <div className="dialog-actions">
                <AlertDialog.Cancel asChild>
                  <Button variant="outline">Keep document</Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <Button variant="destructive" onClick={() => void remove()}>
                    Delete document
                  </Button>
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </PageHeader>
      {active && (
        <div className="notice" role="status">
          <LoaderCircle size={16} className="spin" />
          {stage ? `Processing — stage: ${stage.toLowerCase()}…` : "Processing document…"}
        </div>
      )}
      {detail.status === "FAILED" && !working && (
        <div className="error-banner" role="alert">
          <TriangleAlert size={17} />
          <span>
            <strong>Processing failed.</strong>{" "}
            {detail.error_message ?? "Retry processing to try again."}
          </span>
        </div>
      )}
      <div className="detail-meta-line">
        <StatusBadge status={detail.status} />
        <span>{doc.documentType}</span>
        <span>Created {formatDate(doc.createdAt)}</span>
        <span>By {doc.author || "Unknown author"}</span>
      </div>
      <div className="detail-layout">
        <Tabs value={tab} onValueChange={setTab}>
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
            <DocumentPreview
              filename={doc.filename}
              fileType={doc.fileType}
              content={detail.extracted_text ?? ""}
            />
          </TabsContent>
          <TabsContent value="structure">
            <OkfPreview okf={okf} loading={okfLoading} error={okfError} />
          </TabsContent>
          <TabsContent value="metadata">
            <div className="metadata-panel">
              <h2>Document metadata</h2>
              <p className="muted">
                Changes are saved to the server and regenerate the OKF bundle.
              </p>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(saveMetadata)}
                  className="metadata-fields"
                >
                  <MetadataForm />
                  {saveError && (
                    <p className="field-error" role="alert">
                      {saveError}
                    </p>
                  )}
                  <div className="form-actions">
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting ? (
                        <LoaderCircle size={15} className="spin" />
                      ) : (
                        <Check size={15} />
                      )}
                      Save changes
                    </Button>
                    {saved && (
                      <span className="notice success" style={{ margin: 0 }}>
                        <Check size={15} />
                        Saved
                      </span>
                    )}
                  </div>
                </form>
              </Form>
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
            Content, metadata, and the OKF bundle live on the OKF server and
            stay in sync across this workspace.
          </div>
        </aside>
      </div>
    </div>
  );
}
