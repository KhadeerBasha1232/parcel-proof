"""Read the courier sticker on a box: barcodes + printed text, and pull out likely package IDs."""

import io
import re
import threading

import numpy as np
import zxingcpp
from PIL import Image, ImageOps

MAX_SIDE = 1800

_engine = None
_engine_lock = threading.Lock()


def _ocr_engine():
    # RapidOCR loads ONNX models (downloaded on first use), so create it once.
    global _engine
    with _engine_lock:
        if _engine is None:
            from rapidocr import RapidOCR

            _engine = RapidOCR()
    return _engine


def warm_up() -> None:
    _ocr_engine()


def normalize(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.upper())


# Label words that usually sit right before the ID we care about, with a priority.
_KEYWORDS = [
    (95, r"AWB|AIR\s*WAY\s*BILL|WAY\s*BILL|WAYBILL"),
    (90, r"TRACKING(?:\s*(?:NO|NUMBER|ID|#))?|TRACK\s*(?:NO|ID)|CONSIGNMENT(?:\s*NO)?|DOCKET(?:\s*NO)?|SHIPMENT\s*(?:NO|ID)|CN\s*NO|LR\s*NO"),
    (60, r"ORDER\s*(?:NO|ID|NUMBER|#)?"),
    (50, r"INVOICE\s*(?:NO|NUMBER|#)?|BILL\s*(?:NO|NUMBER|#)"),
    (40, r"REF(?:ERENCE)?\s*(?:NO|#)?"),
]
_KEYWORD_LABELS = {95: "AWB", 90: "Tracking no.", 60: "Order ID", 50: "Invoice / bill no.", 40: "Reference"}
_ID_TOKEN = r"([A-Z0-9][A-Z0-9\-/]{4,}[A-Z0-9])"


def _load(image_bytes: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img).convert("RGB")  # phone photos are often rotated via EXIF
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    return img


def _read_barcodes(img: Image.Image) -> list[dict]:
    found: dict[str, dict] = {}
    for candidate in (img, ImageOps.autocontrast(img.convert("L"))):
        try:
            results = zxingcpp.read_barcodes(candidate)
        except Exception:
            continue
        for r in results:
            if r.text and r.text not in found:
                found[r.text] = {"text": r.text, "format": str(r.format).split(".")[-1]}
        if found:
            break
    return list(found.values())


def _read_text(img: Image.Image) -> list[dict]:
    result = _ocr_engine()(np.asarray(img))
    txts = getattr(result, "txts", None) or ()
    scores = getattr(result, "scores", None) or ()
    return [
        {"text": t.strip(), "score": round(float(s), 3)}
        for t, s in zip(txts, scores)
        if t and t.strip()
    ]


def _candidates(barcodes: list[dict], lines: list[dict]) -> list[dict]:
    out: dict[str, dict] = {}

    def add(value: str, priority: int, source: str, label: str):
        value = value.strip(" -/:#.")
        norm = normalize(value)
        if len(norm) < 5:
            return
        if norm not in out or out[norm]["priority"] < priority:
            out[norm] = {"value": value, "normalized": norm, "priority": priority, "source": source, "label": label}

    for b in barcodes:
        # QR codes on labels often hold URLs or long JSON; keep them only when short
        text = b["text"].strip()
        if len(text) <= 40 and " " not in text:
            add(text, 100, "barcode", f"Barcode ({b['format']})")

    for line in lines:
        upper = line["text"].upper()
        for priority, pattern in _KEYWORDS:
            for m in re.finditer(
                rf"(?:{pattern})(?:\s*(?:NO|NUMBER|ID|#)\.?)?\s*[:#.\-]*\s*{_ID_TOKEN}", upper
            ):
                if re.search(r"\d", m.group(1)):
                    add(m.group(1), priority, "text", _KEYWORD_LABELS[priority])
        # any long code with several digits (e.g. 81234567890, EE123456789IN)
        for token in re.findall(r"\b[A-Z0-9][A-Z0-9\-]{6,}[A-Z0-9]\b", upper):
            if sum(c.isdigit() for c in token) >= 6:
                add(token, 30, "text", "Code in text")

    return sorted(out.values(), key=lambda c: -c["priority"])


def read_sticker(image_bytes: bytes) -> dict:
    img = _load(image_bytes)
    barcodes = _read_barcodes(img)
    lines = _read_text(img)
    return {
        "text": "\n".join(l["text"] for l in lines),
        "lines": lines,
        "barcodes": barcodes,
        "candidates": _candidates(barcodes, lines),
    }


def match_score(label_norm: str, candidates: list[dict], full_text: str) -> tuple[float, str] | None:
    """How confidently this photo shows the given sticker ID. None = no match."""
    if not label_norm:
        return None
    for c in candidates:
        if c["normalized"] == label_norm:
            return (1.0 if c["source"] == "barcode" else 0.95), (
                "Barcode matched" if c["source"] == "barcode" else "Sticker text matched"
            )
    if len(label_norm) >= 6 and _in_tokens(label_norm, full_text, canon=False):
        return 0.9, "Found in sticker text"
    # OCR can confuse look-alike characters (0/O, 1/I, 8/B). Only those count:
    # a different digit is a different parcel, since courier numbers are often sequential.
    label_canon = _canon(label_norm)
    for c in candidates:
        if _canon(c["normalized"]) == label_canon:
            return 0.85, "Matched allowing look-alike characters (O/0, I/1, S/5, B/8)"
    if len(label_norm) >= 6 and _in_tokens(label_canon, full_text, canon=True):
        return 0.8, "Found in sticker text allowing look-alike characters"
    return None


def _in_tokens(target: str, full_text: str, canon: bool) -> bool:
    """True if whole adjacent tokens on one line join up to exactly the target.

    Handles IDs printed with spaces or dashes ("8123 4567 890") without matching
    a number that only appears inside a longer one.
    """
    for line in full_text.splitlines():
        tokens = re.findall(r"[A-Z0-9]+", line.upper())
        if canon:
            tokens = [_canon(t) for t in tokens]
        for i in range(len(tokens)):
            joined = ""
            for t in tokens[i:]:
                joined += t
                if joined == target:
                    return True
                if len(joined) >= len(target):
                    break
    return False


_LOOKALIKE = str.maketrans({"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "S": "5", "B": "8", "Z": "2", "G": "6"})


def _canon(value: str) -> str:
    return value.translate(_LOOKALIKE)
