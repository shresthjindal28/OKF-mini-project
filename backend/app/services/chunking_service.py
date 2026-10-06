import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Chunk:
    index: int
    content: str
    heading: str
    word_count: int


class ChunkingService:
    """Paragraph/heading-aware, word-budgeted chunks; bounded overlap within sections."""

    def __init__(self, size: int, overlap: int) -> None:
        if size <= 0 or not 0 <= overlap < size:
            raise ValueError("Invalid chunk size or overlap")
        self.size = size
        self.overlap = overlap

    def chunk(self, text: str) -> list[Chunk]:
        sections: list[tuple[str, str]] = []
        heading = ""
        lines: list[str] = []
        fence: str | None = None
        for line in text.splitlines():
            marker = re.match(r"^\s*(`{3,}|~{3,})", line)
            if marker:
                token = marker[1][0]
                fence = None if fence == token else token if fence is None else fence
            if fence is None and re.match(r"^#{1,6}\s+", line):
                if lines:
                    sections.append((heading, "\n".join(lines)))
                heading = line.lstrip("# ").strip()
                lines = [line]
            else:
                lines.append(line)
        if lines:
            sections.append((heading, "\n".join(lines)))
        result: list[Chunk] = []
        for heading, section in sections:
            units: list[str] = []
            for paragraph in re.split(r"\n\s*\n", section):
                if not paragraph.strip():
                    continue
                if len(paragraph.split()) <= self.size:
                    units.append(paragraph.strip())
                else:
                    # Sentence boundaries first; word windows only for oversized sentences/tables/code.
                    for sentence in re.split(r"(?<=[.!?])\s+|\n", paragraph):
                        words = sentence.split()
                        units.extend(
                            " ".join(words[i : i + self.size])
                            for i in range(0, len(words), self.size)
                        )
            current: list[str] = []
            count = 0
            for unit in units:
                words = unit.split()
                if current and count + len(words) > self.size:
                    content = "\n\n".join(current)
                    result.append(Chunk(len(result), content, heading, len(content.split())))
                    overlap = content.split()[-self.overlap :] if self.overlap else []
                    overlap = (
                        overlap[-max(0, self.size - len(words)) :] if len(words) < self.size else []
                    )
                    current = [" ".join(overlap)] if overlap else []
                    count = len(overlap)
                current.append(unit)
                count += len(words)
            if current:
                content = "\n\n".join(current)
                result.append(Chunk(len(result), content, heading, len(content.split())))
        return result
