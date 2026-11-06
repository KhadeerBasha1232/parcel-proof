# Parcel Proof

Photo + GPS + device proof that a package was sent and delivered, using the courier sticker that's already on the box.

- **Sender** photographs the box so the courier sticker / bill is readable. The server reads the sticker (barcode + OCR text) and suggests the package ID (AWB, tracking no., order no., invoice no.). The sender confirms or edits it, and the package is saved with the photo, GPS location and device info.
- **Receiver** photographs the same sticker when the box arrives. The server reads it again, finds the matching package, and the receiver confirms. The delivery photo, location and device are saved and the package is marked **delivered**.
- **Packages** lists everything with status, both photos, what OCR read, how the package was identified, maps, distance travelled and full device info.

No new label is printed; the existing sticker is the identifier.

## Run it

```bash
npm run install-both   # installs root, frontend (npm) and backend (Python venv + OCR models)
npm run both           # API on :8000, web app on :5173
```

Open http://localhost:5173

The first start of the API takes a few seconds while the OCR models load. The API doesn't auto-reload; restart `npm run both` after changing backend code.

### Testing on a phone

Browsers only allow camera streaming and GPS on `https` (or `localhost`). To use the app from a phone on the same Wi-Fi:

```bash
npm run both:https
```

Then open `https://<your-PC-LAN-IP>:5173` on the phone and accept the self-signed certificate warning.

## How sticker reading works

`backend/app/ocr.py`

1. **Barcodes** are decoded with [zxing-cpp](https://github.com/zxing-cpp/zxing-cpp) (Code 128, QR, etc.). Most reliable source.
2. **Text** is read with [RapidOCR](https://github.com/RapidAI/RapidOCR) (PaddleOCR models on ONNX Runtime, CPU only, no system install).
3. **ID candidates** are pulled out by priority: barcode > text after `AWB` / `Tracking` / `Consignment` > `Order ID` > `Invoice` / `Bill no.` > any long code with 6+ digits.
4. **Matching** a receiver photo to a package: exact candidate match, or the ID made of whole adjacent tokens on one line (handles `8123 4567 890`). Look-alike OCR mistakes (O/0, I/1, S/5, B/8) are tolerated, but a different digit never matches, because courier numbers are often sequential.

## Layout

| Path | What |
| --- | --- |
| `frontend/` | Vite + React + shadcn/ui. `/api` and `/uploads` are proxied to the backend. |
| `backend/app/main.py` | FastAPI routes |
| `backend/app/ocr.py` | Barcode + OCR reading, ID extraction, matching |
| `backend/app/models.py` | `Photo`, `Package`, `ScanEvent` tables (SQLAlchemy) |
| `backend/data/` | SQLite database `app.db` and uploaded photos (created on first run) |
| `scripts/backend.mjs` | Cross-platform venv install / uvicorn runner |

## API

| Method | Path | |
| --- | --- | --- |
| `POST` | `/api/photos` | multipart `photo`. Saves it, reads the sticker, returns `photo_id`, text, barcodes, ID candidates and matching packages. |
| `POST` | `/api/packages` | JSON: `photo_id`, `label_code`, `matched_by`, `sender_name`, `receiver_name`, `destination`, `description`, `location`, `device_info`. 409 if the sticker ID already exists. |
| `POST` | `/api/packages/{id}/deliver` | JSON: `photo_id`, `matched_by`, `receiver_name`, `notes`, `location`, `device_info`. 409 if already delivered. |
| `GET` | `/api/packages?status=&q=` | list / search |
| `GET` | `/api/packages/{id}` | one package with its events |
| `GET` | `/api/stats` | counts |

Interactive docs: http://localhost:8000/docs
