"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page empty-state">
      <h1>Something went wrong</h1>
      <p>Try opening your workspace again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
