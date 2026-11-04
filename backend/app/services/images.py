from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

# Larger images raise DecompressionBombError instead of exhausting memory.
Image.MAX_IMAGE_PIXELS = 40_000_000

FORMATS = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png")}
MODEL_MAX_EDGE = 2048  # long edge sent to the vision model; keeps small print legible


class ImageError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class CleanImage:
    data: bytes  # stored copy: original pixels, upright, no metadata
    media_type: str
    extension: str
    model_data: bytes  # downscaled JPEG for the extractor


def clean_upload(raw: bytes, max_bytes: int) -> CleanImage:
    """Validate an upload and re-encode it without EXIF/GPS or other metadata."""
    if len(raw) > max_bytes:
        raise ImageError("file_too_large")
    try:
        with Image.open(BytesIO(raw)) as src:
            if src.format not in FORMATS:
                raise ImageError("unsupported_type")
            media_type, extension = FORMATS[src.format]
            img = ImageOps.exif_transpose(src)  # apply camera rotation before EXIF is dropped
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ImageError("invalid_image") from None

    img.info = {}  # never carry metadata over into the saved file
    stored = BytesIO()
    if extension == "jpg":
        img.convert("RGB").save(stored, "JPEG", quality=92)
    else:
        img.save(stored, "PNG")

    model = img.convert("RGB")
    model.thumbnail((MODEL_MAX_EDGE, MODEL_MAX_EDGE))
    model_bytes = BytesIO()
    model.save(model_bytes, "JPEG", quality=90)
    return CleanImage(stored.getvalue(), media_type, extension, model_bytes.getvalue())
