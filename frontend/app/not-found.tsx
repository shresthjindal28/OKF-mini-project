import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="page empty-state">
      <h1>This page isn’t in the library.</h1>
      <p>Head back to your workspace to find your documents.</p>
      <Button asChild>
        <Link href="/">Back to overview</Link>
      </Button>
    </div>
  );
}
