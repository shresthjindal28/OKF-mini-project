from pydantic import BaseModel, ConfigDict, Field, JsonValue


class AIStructure(BaseModel):
    """Private enrichment schema, not an official OKF schema."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(max_length=2000)
    tags: list[str] = Field(default_factory=list, max_length=30)


class OKFRepresentation(BaseModel):
    version: str = "0.2"
    files: dict[str, str]
    metadata: dict[str, JsonValue]
