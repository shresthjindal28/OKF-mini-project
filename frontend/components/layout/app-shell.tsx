"use client";
import { useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import {
  DocumentProvider,
  useDocuments,
} from "@/components/documents/document-provider";
function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { error, refresh } = useDocuments();
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar open={open} close={() => setOpen(false)} />
      <div className="main-shell">
        <Header onMenu={() => setOpen(true)} />
        <main id="main">
          {error && (
            <div role="alert" className="error-banner">
              <TriangleAlert size={17} />
              <span>
                {error}{" "}
                <button type="button" onClick={() => void refresh()}>
                  Retry
                </button>
              </span>
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
            Powered by the OKF Builder API
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
