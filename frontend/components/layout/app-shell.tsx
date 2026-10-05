"use client";
import { useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import {
  DocumentProvider,
  useDocuments,
} from "@/components/documents/document-provider";
function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { storageError } = useDocuments();
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar open={open} close={() => setOpen(false)} />
      <div className="main-shell">
        <Header onMenu={() => setOpen(true)} />
        <main id="main">
          {storageError && (
            <div role="alert" className="notice">
              {storageError}
            </div>
          )}
          {children}
        </main>
        <footer>
          <span>
            Open Knowledge Format <span className="footer-dot">·</span> A little
            structure. A lot of possibility.
          </span>
          <span>
            <i />
            All changes stay in your browser
          </span>
        </footer>
      </div>
    </>
  );
}
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <DocumentProvider>
      <Shell>{children}</Shell>
    </DocumentProvider>
  );
}
