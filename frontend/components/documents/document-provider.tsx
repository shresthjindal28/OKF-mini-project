"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { sampleDocuments, type DocumentRecord } from "@/lib/documents";
const storedDocuments = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    author: z.string(),
    tags: z.array(z.string()),
    documentType: z.string(),
    filename: z.string(),
    fileType: z.string(),
    size: z.number(),
    createdAt: z.string(),
    status: z.enum(["Ready", "Draft"]),
    content: z.string(),
  }),
);
const Context = createContext<{
  documents: DocumentRecord[];
  loaded: boolean;
  addDocument: (doc: DocumentRecord) => void;
  deleteDocument: (id: string) => void;
  storageError: string;
} | null>(null);
export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>(sampleDocuments);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem("okf-documents-v1");
        if (saved) {
          const result = storedDocuments.safeParse(JSON.parse(saved));
          if (result.success) setDocuments(result.data);
          else
            setStorageError(
              "Saved data could not be read. Showing sample documents.",
            );
        }
      } catch {
        setStorageError(
          "Browser storage is unavailable. Changes will last for this session.",
        );
      }
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function update(next: DocumentRecord[]) {
    setDocuments(next);
    try {
      localStorage.setItem("okf-documents-v1", JSON.stringify(next));
    } catch {
      setStorageError(
        "Changes are available this session, but could not be saved to browser storage.",
      );
    }
  }
  return (
    <Context.Provider
      value={{
        documents,
        loaded,
        storageError,
        addDocument: (doc) => update([doc, ...documents]),
        deleteDocument: (id) => update(documents.filter((d) => d.id !== id)),
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
