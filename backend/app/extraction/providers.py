import base64
import hashlib
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, TypeVar
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from pydantic import BaseModel

from app.config import get_settings
from app.extraction.schema import LabelExtraction, PlainLabelExtraction

logger = logging.getLogger(__name__)

# Bump on every prompt change; it is stored with each extraction and part of the cache key.
PROMPT_VERSION = "2026-11-03.1"

PROMPT = """You read the label of a herbal product for a pharmacist. Fill in every field of the \
schema from the label above.

Rules:
- Copy values exactly as printed, in the label's own language and spelling. Do not translate, \
convert, expand abbreviations or map common plant names to Latin names.
- Never infer or guess a value that is not printed. If a field is not on the label, set status \
"not_stated" and value and evidence to null. Absent information is missing, not a default.
- Use JSON null for absent values, never the strings "none", "null", "N/A" or an empty string.
- If text for a field is present but you cannot read it reliably, set status "unreadable".
- evidence is the exact label text the value was copied from (a word, line or phrase).
- confidence is how sure you are the value was read correctly: about 0.9 or higher for clear \
text, 0.5-0.85 for small, partly hidden or reflective text, below 0.5 if hard to read.
- label_readable is false only if the image is too blurred, dark or cut off to read at all.
- is_herbal_product is false for conventional medicines (for example ibuprofen tablets) and \
for products that contain no plant material.

Fields:
- plant: the plant named as an ingredient (common or Latin name, as printed)
- plant_part: the part of the plant used (for example root, leaf, herb, flower)
- preparation_type: the form of the herbal ingredient (for example dry extract, tincture, \
powdered herb, tea)
- extract_ratio: the drug-extract ratio (DER), for example "4-7:1"
- solvent: the extraction solvent and its strength, for example "ethanol 60% (V/V)"
- marker: a standardised marker and its content, for example "0.2% hypericin"
- dose: the amount of herbal ingredient per unit (tablet, capsule, ml), as printed
- other_ingredients: all other listed ingredients, including colourants
- batch: the batch or lot number
- expiry: the expiry or best-before date"""

# Validation baseline only: a plain request without the evidence and never-infer rules above.
PLAIN_PROMPT_VERSION = "plain-2026-11-04.1"
PLAIN_PROMPT = """Read the label of this herbal product and fill in the fields: plant, plant part, \
preparation type, extract ratio, extraction solvent, standardised marker, dose per unit, other \
ingredients, batch number, expiry date and product name. Use null for anything you cannot find."""

Schema = TypeVar("Schema", bound=BaseModel)


class ExtractionError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class ExtractionResult:
    raw: dict[str, Any]
    fields: LabelExtraction
    provider: str
    model: str
    cache_key: str
    latency_ms: int | None


class ExtractionProvider(Protocol):
    name: str
    model: str

    # image is always JPEG (the model copy made by services.images).
    def extract(self, *, image: bytes | None, text: str | None) -> ExtractionResult: ...


def cache_key(data: bytes, model: str, prompt_version: str = PROMPT_VERSION) -> str:
    return hashlib.sha256(data + prompt_version.encode() + model.encode()).hexdigest()


def read_cached(cache_dir: str | Path, key: str) -> dict[str, Any] | None:
    path = Path(cache_dir) / f"{key}.json"
    return json.loads(path.read_text())["output"] if path.is_file() else None


def _input_bytes(image: bytes | None, text: str | None) -> bytes:
    if image is not None:
        return image
    if text is not None:
        return text.encode()
    raise ValueError("image or text is required")


class CachedProvider:
    """Replays saved outputs so tests and validation run without keys or cost."""

    name = "cached"

    def __init__(self, model: str, cache_dir: str | Path):
        self.model = model
        self.cache_dir = Path(cache_dir)

    def extract(self, *, image: bytes | None, text: str | None) -> ExtractionResult:
        key = cache_key(_input_bytes(image, text), self.model)
        output = read_cached(self.cache_dir, key)
        if output is None:
            raise ExtractionError("not_in_cache")
        fields = LabelExtraction.model_validate(output)
        return ExtractionResult(output, fields, self.name, self.model, key, None)


def _groq_schema(schema: type[Schema]) -> dict[str, Any]:
    if schema is PlainLabelExtraction:
        names = list(PlainLabelExtraction.model_fields)
        return {
            "type": "object",
            "properties": {name: {"type": ["string", "null"]} for name in names},
            "required": names,
            "additionalProperties": False,
        }
    field = {
        "type": "object",
        "properties": {
            "value": {"type": ["string", "null"]},
            "status": {"type": "string", "enum": ["stated", "not_stated", "unreadable"]},
            "confidence": {"type": "number"},
            "evidence": {"type": ["string", "null"]},
        },
        "required": ["value", "status", "confidence", "evidence"],
        "additionalProperties": False,
    }
    names = list(LabelExtraction.model_fields)
    return {
        "type": "object",
        "properties": {
            "label_readable": {"type": "boolean"},
            "is_herbal_product": {"type": "boolean"},
            "product_name": {"type": ["string", "null"]},
            **{name: field for name in names[3:]},
        },
        "required": names,
        "additionalProperties": False,
    }


class GroqProvider:
    name = "groq"

    def __init__(self, model: str, api_key: str, cache_dir: str | Path):
        self.model = model
        self.api_key = api_key
        self.cache_dir = Path(cache_dir)

    def extract(self, *, image: bytes | None, text: str | None) -> ExtractionResult:
        key = cache_key(_input_bytes(image, text), self.model)
        cached = read_cached(self.cache_dir, key)
        if cached is not None:
            fields = LabelExtraction.model_validate(cached)
            return ExtractionResult(cached, fields, self.name, self.model, key, None)
        started = time.monotonic()
        fields = self._parse(image, text, PROMPT, LabelExtraction)
        output = fields.model_dump(mode="json")
        self._save(key, PROMPT_VERSION, output)
        return ExtractionResult(
            output, fields, self.name, self.model, key, int((time.monotonic() - started) * 1000)
        )

    def extract_plain(self, *, image: bytes | None, text: str | None) -> dict[str, Any]:
        key = cache_key(_input_bytes(image, text), self.model, PLAIN_PROMPT_VERSION)
        output = self._parse(image, text, PLAIN_PROMPT, PlainLabelExtraction).model_dump()
        self._save(key, PLAIN_PROMPT_VERSION, output)
        return output

    def _parse(
        self, image: bytes | None, text: str | None, prompt: str, schema: type[Schema]
    ) -> Schema:
        if not self.api_key:
            raise ExtractionError("provider_misconfigured")
        content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        if image is not None:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "data:image/jpeg;base64," + base64.b64encode(image).decode("ascii")
                    },
                }
            )
        else:
            content.append({"type": "text", "text": f"<label_text>\n{text}\n</label_text>"})
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": content}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "label_extraction",
                    "strict": True,
                    "schema": _groq_schema(schema),
                },
            },
            "max_completion_tokens": 4096,
        }
        request = Request(  # noqa: S310 - fixed HTTPS endpoint
            "https://api.groq.com/openai/v1/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                "User-Agent": "LabelLens/0.1 (+https://github.com/Zanaad/LabelLens)",
            },
            method="POST",
        )
        for attempt in range(2):
            try:
                with urlopen(request, timeout=120) as response:  # noqa: S310 - fixed HTTPS endpoint
                    result = json.load(response)
            except HTTPError as exc:
                logger.warning("Groq extraction HTTP %s", exc.code)
                if exc.code in (401, 403, 404):
                    raise ExtractionError("provider_misconfigured") from None
                if attempt == 0 and exc.code == 400 and b"json_validate_failed" in exc.read():
                    request = self._relaxed_request(request, body)
                    continue
                if attempt == 0 and exc.code in BUSY_CODES:
                    time.sleep(_retry_wait(exc))
                    continue
                raise ExtractionError("provider_unavailable") from None
            except OSError as exc:
                logger.warning("Groq extraction connection error: %s", type(exc).__name__)
                if attempt == 0:
                    continue
                raise ExtractionError("provider_unavailable") from None
            except (ValueError, TypeError):
                raise ExtractionError("extraction_failed") from None
            try:
                raw = json.loads(result["choices"][0]["message"]["content"])
                return schema.model_validate(raw)
            except (KeyError, IndexError, TypeError, ValueError):
                if attempt == 0:
                    request = self._relaxed_request(request, body)
                    continue
                raise ExtractionError("extraction_failed") from None
        raise ExtractionError("extraction_failed")

    @staticmethod
    def _relaxed_request(request: Request, body: dict[str, Any]) -> Request:
        retry_body = {**body, "response_format": {"type": "json_object"}}
        return Request(  # noqa: S310 - fixed HTTPS endpoint
            "https://api.groq.com/openai/v1/chat/completions",
            data=json.dumps(retry_body).encode("utf-8"),
            headers=dict(request.header_items()),
            method="POST",
        )

    def _save(self, key: str, prompt_version: str, output: dict[str, Any]) -> None:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        record = {
            "provider": self.name,
            "model": self.model,
            "prompt_version": prompt_version,
            "output": output,
        }
        (self.cache_dir / f"{key}.json").write_text(
            json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8"
        )


BUSY_CODES = (429, 500, 502, 503, 504)  # rate limit or Groq overloaded: worth one more try


def _retry_wait(exc: HTTPError) -> float:
    # Groq says how long to wait on a rate limit; cap it so the upload doesn't hang.
    try:
        return min(float(exc.headers.get("retry-after", 3)), 10.0)
    except (AttributeError, TypeError, ValueError):
        return 3.0


def get_extraction_provider() -> ExtractionProvider:
    s = get_settings()
    if s.extraction_provider == "groq":
        return GroqProvider(s.groq_model, s.groq_api_key, s.extraction_cache_dir)
    return CachedProvider(s.extraction_model, s.extraction_cache_dir)
