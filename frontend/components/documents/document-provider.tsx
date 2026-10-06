"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ApiError, api } from "@/lib/api";
import {
  type ApiDocument,
  type ApiDocumentDetail,
  type ApiStats,
  type DocumentRecord,
  toRecord,
} from "@/lib/documents";

type DocumentChanges = {
  title?: string;
  description?: string;
  author?: string;
  document_type?: string;
  tags?: string[];
};

type DocumentsContextValue = {
  documents: DocumentRecord[];
  stats: ApiStats | null;
  loaded: boolean;
  error: string;
  refresh: () => Promise<void>;
  addDocument: (doc: ApiDocument) => void;
  deleteDocument: (id: string) => Promise<void>;
  updateDocument: (id: string, changes: DocumentChanges) => Promise<ApiDocumentDetail>;
};

const Context = createContext<DocumentsContextValue | null>(null);

async function fetchLibrary() {
  return Promise.all([
    api.get<{ items: ApiDocument[]; total: number }>(
      "/documents?page_size=100&sort_by=created_at&order=desc",
    ),
    api.get<ApiStats>("/stats"),
  ]);
}

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  // Initial library load; setStates run in promise callbacks, not in the effect body.
  useEffect(() => {
    let cancelled = false;
    fetchLibrary()
      .then(([page, nextStats]) => {
        if (cancelled) return;
        setDocuments(page.items.map(toRecord));
        setStats(nextStats);
        setError("");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof ApiError
            ? cause.message
            : "Something went wrong while loading your library.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Manual reload (error-banner retry); same data as the initial effect load.
  const refresh = useCallback(async () => {
    try {
      const [page, nextStats] = await fetchLibrary();
      setDocuments(page.items.map(toRecord));
      setStats(nextStats);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Something went wrong while loading your library.",
      );
    }
  }, []);

  const addDocument = useCallback((doc: ApiDocument) => {
    setDocuments((current) => [toRecord(doc), ...current]);
    setStats((current) =>
      current
        ? {
            ...current,
            total: current.total + 1,
            in_progress: current.in_progress + 1,
            total_bytes: current.total_bytes + doc.file_size,
          }
        : current,
    );
  }, []);

  const deleteDocument = useCallback(
    async (id: string) => {
      await api.delete(`/documents/${id}`);
      const removed = documents.find((doc) => doc.id === id);
      setDocuments((current) => current.filter((doc) => doc.id !== id));
      setStats((current) =>
        current
          ? {
              ...current,
              total: Math.max(0, current.total - 1),
              ready:
                removed?.status === "READY"
                  ? Math.max(0, current.ready - 1)
                  : current.ready,
              in_progress:
                removed && removed.status !== "READY" && removed.status !== "FAILED"
                  ? Math.max(0, current.in_progress - 1)
                  : current.in_progress,
              failed:
                removed?.status === "FAILED"
                  ? Math.max(0, current.failed - 1)
                  : current.failed,
              total_bytes: Math.max(0, current.total_bytes - (removed?.size ?? 0)),
            }
          : current,
      );
    },
    [documents],
  );

  const updateDocument = useCallback(
    async (id: string, changes: DocumentChanges) => {
      const updated = await api.patch<ApiDocumentDetail>(`/documents/${id}`, changes);
      const record = toRecord(updated);
      setDocuments((current) =>
        current.map((doc) => (doc.id === id ? record : doc)),
      );
      return updated;
    },
    [],
  );

  return (
    <Context.Provider
      value={{
        documents,
        stats,
        loaded,
        error,
        refresh,
        addDocument,
        deleteDocument,
        updateDocument,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useDocuments() {
  const value = useContext(Context);
  if (!value) throw new Error("DocumentProvider is required");
  return value;
}
