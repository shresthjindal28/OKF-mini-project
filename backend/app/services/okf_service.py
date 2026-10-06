import io
import re
import zipfile
from datetime import UTC, datetime
from pathlib import PurePosixPath

import yaml
from pydantic import JsonValue, TypeAdapter

from app.core.errors import AppError
from app.schemas.okf import OKFRepresentation


class OKFService:
    """OKF v0.2 producer; permissive concept reader per official §11."""

    def serialize(self, metadata: dict[str, JsonValue], body: str) -> str:
        value = (
            "---\n"
            + yaml.safe_dump(metadata, allow_unicode=True, sort_keys=False)
            + "---\n"
            + body.rstrip()
            + "\n"
        )
        self.load(value)
        return value

    def load(self, content: str) -> tuple[dict[str, JsonValue], str]:
        match = re.match(r"\A---\r?\n(.*?)\r?\n---(?:\r?\n|$)(.*)\Z", content, re.DOTALL)
        if not match:
            raise AppError("INVALID_OKF", "Concept requires YAML frontmatter", 422)
        try:
            # BaseLoader preserves timestamp spelling and extension keys without constructing objects.
            # SafeLoader gives JSON-compatible standard scalars; dates are normalized to ISO strings.
            raw = yaml.safe_load(match[1])
            metadata = self._json_metadata(raw)
        except (yaml.YAMLError, ValueError, TypeError, RecursionError) as exc:
            raise AppError("INVALID_OKF", "Frontmatter must be a valid mapping", 422) from exc
        if not isinstance(metadata.get("type"), str) or not str(metadata["type"]).strip():
            raise AppError("INVALID_OKF", "Concept requires a non-empty string type", 422)
        if isinstance(metadata.get("verified"), dict):
            metadata["verified"] = [metadata["verified"]]
        return metadata, match[2]

    @staticmethod
    def _json_metadata(raw: object) -> dict[str, JsonValue]:
        import json
        from datetime import date

        def encode(value: object) -> str:
            if isinstance(value, (date, datetime)):
                return value.isoformat()
            raise TypeError("Unsupported YAML value")

        if not isinstance(raw, dict) or any(not isinstance(key, str) for key in raw):
            raise ValueError("Expected mapping")
        return TypeAdapter(dict[str, JsonValue]).validate_json(json.dumps(raw, default=encode))

    def generate(
        self,
        *,
        title: str,
        description: str,
        document_type: str,
        tags: list[str],
        text: str,
        source_name: str,
        source_extension: str,
        author: str = "",
    ) -> OKFRepresentation:
        asset = self.source_asset(source_extension)
        source: dict[str, JsonValue] = {"id": "source", "resource": asset, "title": source_name}
        if author:
            source["author"] = "human:" + author
        metadata: dict[str, JsonValue] = {
            "type": document_type,
            "title": title,
            "description": description,
            "tags": list(tags),
            "status": "draft",
            "generated": {"by": "process:okf-builder", "at": datetime.now(UTC).isoformat()},
            "sources": [source],
        }
        concept = self.serialize(metadata, text)
        label = re.sub(r"[\[\]\r\n]", " ", title)
        summary = re.sub(r"[\r\n]", " ", description)
        index = (
            '---\nokf_version: "0.2"\n---\n# Knowledge bundle\n\n'
            + f"* [{label}](document.md) - {summary}\n"
        )
        representation = OKFRepresentation(
            files={"index.md": index, "document.md": concept}, metadata=metadata
        )
        self.validate(representation.files)
        return representation

    @staticmethod
    def source_asset(extension: str) -> str:
        # Raw uploaded Markdown is not automatically an OKF concept.
        return "assets/source" + (".md.txt" if extension == ".md" else extension)

    def validate(self, files: dict[str, str]) -> None:
        for name, content in files.items():
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts or "\\" in name:
                raise AppError("INVALID_OKF", "Unsafe bundle path", 422)
            if path.suffix != ".md":
                continue
            if path.name == "index.md":
                body = content
                if content.startswith("---\n"):
                    if name != "index.md":
                        raise AppError(
                            "INVALID_OKF", "Only the root index may have frontmatter", 422
                        )
                    parts = content.split("---\n", 2)
                    try:
                        frontmatter = yaml.safe_load(parts[1])
                    except yaml.YAMLError as exc:
                        raise AppError("INVALID_OKF", "Invalid index frontmatter", 422) from exc
                    if (
                        len(parts) != 3
                        or not isinstance(frontmatter, dict)
                        or set(frontmatter) != {"okf_version"}
                    ):
                        raise AppError("INVALID_OKF", "Invalid index frontmatter", 422)
                    body = parts[2]
                if not re.search(r"^#+ .+", body, re.MULTILINE) or not re.search(
                    r"^[*+-] \[.+\]\(.+\)", body, re.MULTILINE
                ):
                    raise AppError("INVALID_OKF", "Index requires grouped links", 422)
            elif path.name == "log.md":
                dates = re.findall(r"^## (.+)$", content, re.MULTILINE)
                try:
                    for value in dates:
                        datetime.strptime(value, "%Y-%m-%d")
                except ValueError as exc:
                    raise AppError("INVALID_OKF", "Log dates must use YYYY-MM-DD", 422) from exc
                if content.startswith("---") or dates != sorted(dates, reverse=True):
                    raise AppError("INVALID_OKF", "Invalid log structure", 422)
            else:
                self.load(content)

    def package(self, files: dict[str, str], original: bytes, extension: str) -> bytes:
        self.validate(files)
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, content in sorted(files.items()):
                archive.writestr(name, content.encode("utf-8"))
            archive.writestr(self.source_asset(extension), original)
        return output.getvalue()
