"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu, Moon, Sun, Layers2 } from "lucide-react";
import { Button } from "@/components/ui/button";
export function Header({ onMenu }: { onMenu: () => void }) {
  const path = usePathname();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const enabled = localStorage.getItem("okf-theme") === "dark";
        setDark(enabled);
        document.documentElement.classList.toggle("dark", enabled);
      } catch {
        /* Theme remains usable without browser storage. */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function toggle() {
    document.documentElement.classList.toggle("dark", !dark);
    setDark(!dark);
    try {
      localStorage.setItem("okf-theme", String(!dark ? "dark" : "light"));
    } catch {}
  }
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <Button
          variant="ghost"
          size="icon"
          className="mobile-menu"
          aria-label="Open navigation"
          onClick={onMenu}
        >
          <Menu size={19} />
        </Button>
        <Layers2 size={16} />
        <span>Workspace</span>
        <ChevronRight size={14} />
        <strong>
          {path === "/"
            ? "Overview"
            : path === "/upload"
              ? "Upload document"
              : path === "/documents"
                ? "Documents"
                : "Document details"}
        </strong>
      </div>
      <div className="topbar-actions">
        <span className="preview-label">LOCAL PREVIEW</span>
        <span className="divider" />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </Button>
        <span className="avatar small">P</span>
      </div>
    </header>
  );
}
