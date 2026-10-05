export const documentTypes = [
  "Guide",
  "Technical specification",
  "Research paper",
  "Meeting notes",
  "Reference",
] as const;
export type DocumentRecord = {
  id: string;
  title: string;
  description: string;
  author: string;
  tags: string[];
  documentType: string;
  filename: string;
  fileType: string;
  size: number;
  createdAt: string;
  status: "Ready" | "Draft";
  content: string;
};
export const sampleDocuments: DocumentRecord[] = [
  {
    id: "getting-started",
    title: "Getting started with Open Knowledge",
    description:
      "A practical introduction to organizing knowledge in an open, portable format.",
    author: "Alex Morgan",
    tags: ["getting-started", "documentation"],
    documentType: "Guide",
    filename: "getting-started.md",
    fileType: "MD",
    size: 24576,
    createdAt: "2026-10-05T09:30:00Z",
    status: "Ready",
    content:
      "# Getting started with Open Knowledge\n\nGood documentation makes knowledge easier to discover, understand, and share. This guide introduces a simple workflow for bringing your documents into one organized workspace.\n\n## Start with a document\n\nChoose a document that captures a useful idea. Add a descriptive title, identify its author, and include a short summary to help readers understand its purpose.\n\n## Give knowledge context\n\nUse a small number of meaningful tags. Consistent metadata makes a growing library easier to explore.\n\n## Review before sharing\n\nCheck the source and its metadata together. Clear, accurate information is the foundation of a useful knowledge library.",
  },
  {
    id: "api-design",
    title: "API design principles",
    description:
      "Conventions for building consistent, understandable interfaces across our products.",
    author: "Jamie Chen",
    tags: ["engineering", "api"],
    documentType: "Technical specification",
    filename: "api-design-principles.pdf",
    fileType: "PDF",
    size: 1258291,
    createdAt: "2026-10-04T14:00:00Z",
    status: "Ready",
    content:
      "# API design principles\n\nOur interface guidelines prioritize clarity, consistency, and predictable behavior.\n\n## Design for the reader\n\nChoose descriptive names and provide examples alongside each concept.\n\n## Keep interfaces consistent\n\nFollow shared conventions so teams can move confidently between projects.",
  },
  {
    id: "research-notes",
    title: "Knowledge graphs: research notes",
    description:
      "Notes on connecting information and exploring relationships in knowledge systems.",
    author: "Sam Rivera",
    tags: ["research", "knowledge"],
    documentType: "Research paper",
    filename: "knowledge-graphs.docx",
    fileType: "DOCX",
    size: 842752,
    createdAt: "2026-10-03T10:15:00Z",
    status: "Draft",
    content:
      "# Knowledge graphs: research notes\n\nThis working document collects questions and observations about connected knowledge.\n\n## Research questions\n\nHow can relationships help readers discover useful context? What makes a connection meaningful?\n\n## Next steps\n\nReview the initial findings with the research team and gather examples.",
  },
  {
    id: "team-handbook",
    title: "The team handbook",
    description: "How we work, collaborate, and share what we learn.",
    author: "Alex Morgan",
    tags: ["team", "handbook"],
    documentType: "Guide",
    filename: "team-handbook.pdf",
    fileType: "PDF",
    size: 2516582,
    createdAt: "2026-10-02T08:00:00Z",
    status: "Ready",
    content:
      "# The team handbook\n\nA shared home for our working agreements and team practices.\n\n## Working together\n\nWrite things down, share context early, and make space for thoughtful feedback.",
  },
  {
    id: "planning-notes",
    title: "Q4 product planning",
    description:
      "Priorities, decisions, and next steps from our quarterly planning session.",
    author: "Taylor Kim",
    tags: ["planning", "product"],
    documentType: "Meeting notes",
    filename: "q4-planning.txt",
    fileType: "TXT",
    size: 12288,
    createdAt: "2026-10-01T16:45:00Z",
    status: "Draft",
    content:
      "# Q4 product planning\n\nFocus areas for the next quarter.\n\n## Priorities\n\nImprove document discovery, simplify the editing experience, and build a more accessible workspace.",
  },
  {
    id: "writing-guide",
    title: "Documentation style guide",
    description: "A shared reference for clear and useful technical writing.",
    author: "Jamie Chen",
    tags: ["writing", "documentation"],
    documentType: "Reference",
    filename: "documentation-style.md",
    fileType: "MD",
    size: 38912,
    createdAt: "2026-09-28T11:00:00Z",
    status: "Ready",
    content:
      "# Documentation style guide\n\nWrite for the people who will use your work.\n\n## Be clear\n\nUse familiar words, short sentences, and concrete examples.\n\n## Build a useful structure\n\nLead with the information readers need most and use descriptive headings.",
  },
];
export function formatSize(bytes: number) {
  return bytes < 1048576
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;
}
export function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
