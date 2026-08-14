"""Magic-byte file validation.

content_type is client-supplied and trivially spoofable.
This module reads the actual file bytes and rejects anything whose
binary signature doesn't match the declared/allowed type.
"""

from fastapi import HTTPException

# ── Magic byte signatures ──────────────────────────────────────────────────────

_SIGNATURES: list[tuple[bytes, str, str]] = [
    # (magic_bytes, canonical_ext, label)
    (b"\xff\xd8\xff",               ".jpg",  "JPEG image"),
    (b"\x89PNG\r\n\x1a\n",          ".png",  "PNG image"),
    (b"GIF8",                        ".gif",  "GIF image"),
    (b"RIFF",                        ".webp", "WebP image"),   # also check offset 8 below
    (b"%PDF",                        ".pdf",  "PDF document"),
    (b"PK\x03\x04",                  ".zip",  "Office document (DOCX/XLSX)"),  # ZIP-based Office
]

# WebP: RIFF....WEBP  (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
def _is_webp(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"

# Allowed preset sets (canonical extensions)
IMAGES_ONLY      = {".jpg", ".png", ".gif", ".webp"}
DOCS_AND_IMAGES  = {".jpg", ".png", ".gif", ".webp", ".pdf", ".zip"}  # .zip covers .docx/.xlsx


def _detect(data: bytes) -> str | None:
    """Return canonical extension for detected file type, or None if unknown."""
    for magic, ext, _ in _SIGNATURES:
        if data[:len(magic)] == magic:
            if ext == ".webp" and not _is_webp(data):
                continue  # RIFF but not WebP — reject
            return ext
    return None


def _safe_ext(detected_ext: str, original_filename: str) -> str:
    """Return a safe file extension.
    For Office documents (.zip magic), use the original extension if it's .docx/.xlsx,
    otherwise fall back to .docx.
    For everything else use the detected canonical extension.
    """
    if detected_ext == ".zip":
        import pathlib
        orig = pathlib.Path(original_filename or "").suffix.lower()
        return orig if orig in {".docx", ".xlsx"} else ".docx"
    return detected_ext


def validate_upload(
    data: bytes,
    original_filename: str,
    allowed: set[str],
    max_mb: int = 10,
) -> str:
    """Validate file bytes against allowed magic-byte types.

    Returns the safe file extension to use when saving.
    Raises HTTPException 400 on any violation.

    allowed: a subset of IMAGES_ONLY or DOCS_AND_IMAGES.
    """
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    mb = len(data) / (1024 * 1024)
    if mb > max_mb:
        raise HTTPException(status_code=400, detail=f"File exceeds {max_mb} MB limit")

    detected = _detect(data)
    if detected is None or detected not in allowed:
        friendly = _friendly_list(allowed)
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Accepted: {friendly}",
        )

    return _safe_ext(detected, original_filename)


def _friendly_list(allowed: set[str]) -> str:
    labels = {
        ".jpg": "JPEG", ".png": "PNG", ".gif": "GIF", ".webp": "WebP",
        ".pdf": "PDF", ".zip": "Word/Excel (.docx, .xlsx)",
    }
    return ", ".join(labels[e] for e in sorted(allowed) if e in labels)
