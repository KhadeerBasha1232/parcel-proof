import math
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .database import UPLOAD_DIR, Base, engine, get_db
from .models import Package, Photo, ScanEvent
from .ocr import match_score, normalize, read_sticker, warm_up
from .schemas import (
    CreatePackageIn,
    DeliverIn,
    LocationIn,
    PackageMatch,
    PackageOut,
    PhotoScanOut,
    ScanEventOut,
    StatsOut,
)

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # loading the OCR models takes a few seconds; do it now instead of on the first scan
    threading.Thread(target=warm_up, daemon=True).start()
    yield


app = FastAPI(title="Parcel Proof API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

MAX_PHOTO_BYTES = 15 * 1024 * 1024
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}


# ---------- helpers ----------

def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def event_out(e: ScanEvent) -> ScanEventOut:
    return ScanEventOut(
        id=e.id,
        kind=e.kind,
        person_name=e.person_name,
        notes=e.notes,
        matched_by=e.matched_by,
        photo_url=f"/uploads/{e.photo.filename}",
        ocr_text=e.photo.ocr_text,
        barcodes=e.photo.barcodes or [],
        latitude=e.latitude,
        longitude=e.longitude,
        accuracy_m=e.accuracy_m,
        altitude_m=e.altitude_m,
        location_error=e.location_error,
        device_info=e.device_info or {},
        ip_address=e.ip_address,
        user_agent=e.user_agent,
        created_at=e.created_at,
    )


def package_out(p: Package) -> PackageOut:
    dispatch = next((e for e in p.events if e.kind == "dispatch"), None)
    delivery = next((e for e in p.events if e.kind == "delivery"), None)
    distance = None
    if (
        dispatch and delivery
        and None not in (dispatch.latitude, dispatch.longitude, delivery.latitude, delivery.longitude)
    ):
        distance = round(
            haversine_km(dispatch.latitude, dispatch.longitude, delivery.latitude, delivery.longitude), 3
        )
    return PackageOut(
        id=p.id,
        label_code=p.label_code,
        sender_name=p.sender_name,
        receiver_name=p.receiver_name,
        destination=p.destination,
        description=p.description,
        status=p.status,
        created_at=p.created_at,
        delivered_at=p.delivered_at,
        distance_km=distance,
        events=[event_out(e) for e in p.events],
    )


def packages_query():
    return select(Package).options(selectinload(Package.events).selectinload(ScanEvent.photo))


def load_package(db: Session, package_id: int) -> Package:
    pkg = db.scalar(packages_query().where(Package.id == package_id))
    if not pkg:
        raise HTTPException(404, "Package not found")
    return pkg


def unused_photo(db: Session, photo_id: str) -> Photo:
    photo = db.get(Photo, photo_id)
    if not photo:
        raise HTTPException(404, "Photo not found. Take the photo again.")
    if db.scalar(select(ScanEvent.id).where(ScanEvent.photo_id == photo_id)):
        raise HTTPException(409, "This photo was already used. Take a new photo.")
    return photo


def find_matches(db: Session, candidates: list[dict], text: str) -> list[PackageMatch]:
    scored: list[tuple[int, float, str]] = []
    for pid, label_norm in db.execute(select(Package.id, Package.label_norm)).all():
        hit = match_score(label_norm, candidates, text)
        if hit:
            scored.append((pid, *hit))
    if not scored:
        return []
    pkgs = {p.id: p for p in db.scalars(packages_query().where(Package.id.in_([s[0] for s in scored])))}
    out = [
        PackageMatch(package=package_out(pkgs[pid]), score=score, reason=reason)
        for pid, score, reason in scored
    ]
    # in-transit packages first, then by confidence
    out.sort(key=lambda m: (m.package.status != "in_transit", -m.score))
    return out


def build_event(
    *, kind: str, request: Request, photo: Photo, person_name: str, notes: str,
    matched_by: str, location: LocationIn, device_info: dict,
) -> ScanEvent:
    return ScanEvent(
        kind=kind,
        photo=photo,
        person_name=person_name.strip(),
        notes=notes.strip(),
        matched_by=matched_by.strip(),
        latitude=location.latitude,
        longitude=location.longitude,
        accuracy_m=location.accuracy,
        altitude_m=location.altitude,
        location_error=location.error,
        device_info=device_info,
        ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )


# ---------- routes ----------

@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)):
    rows = dict(db.execute(select(Package.status, func.count()).group_by(Package.status)).all())
    return StatsOut(
        total=sum(rows.values()),
        in_transit=rows.get("in_transit", 0),
        delivered=rows.get("delivered", 0),
    )


@app.post("/api/photos", response_model=PhotoScanOut, status_code=201)
async def upload_photo(photo: UploadFile = File(...), db: Session = Depends(get_db)):
    """Save a photo of the box, read its sticker (barcode + text) and find packages it matches."""
    if not (photo.content_type or "").startswith("image/"):
        raise HTTPException(400, "Photo must be an image")
    data = await photo.read()
    if not data:
        raise HTTPException(400, "Photo is empty")
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Photo is larger than 15 MB")

    try:
        result = await run_in_threadpool(read_sticker, data)
    except Exception as exc:  # unreadable / unsupported image
        raise HTTPException(400, f"Could not read the image: {exc}") from exc

    photo_id = uuid.uuid4().hex
    ext = Path(photo.filename or "").suffix.lower()
    filename = f"{photo_id}{ext if ext in ALLOWED_EXT else '.jpg'}"
    (UPLOAD_DIR / filename).write_bytes(data)
    db.add(
        Photo(
            id=photo_id,
            filename=filename,
            ocr_text=result["text"],
            ocr_lines=result["lines"],
            barcodes=result["barcodes"],
            candidates=result["candidates"],
        )
    )
    db.commit()

    return PhotoScanOut(
        photo_id=photo_id,
        photo_url=f"/uploads/{filename}",
        text=result["text"],
        barcodes=result["barcodes"],
        candidates=result["candidates"],
        matches=find_matches(db, result["candidates"], result["text"]),
    )


@app.get("/api/packages", response_model=list[PackageOut])
def list_packages(status: str | None = None, q: str | None = None, db: Session = Depends(get_db)):
    stmt = packages_query().order_by(Package.created_at.desc())
    if status:
        stmt = stmt.where(Package.status == status)
    if q and q.strip():
        like = f"%{q.strip()}%"
        cond = (
            Package.label_code.ilike(like)
            | Package.sender_name.ilike(like)
            | Package.receiver_name.ilike(like)
            | Package.destination.ilike(like)
        )
        if normalize(q):
            cond = cond | Package.label_norm.contains(normalize(q))
        stmt = stmt.where(cond)
    return [package_out(p) for p in db.scalars(stmt).all()]


@app.get("/api/packages/{package_id}", response_model=PackageOut)
def get_package(package_id: int, db: Session = Depends(get_db)):
    return package_out(load_package(db, package_id))


@app.post("/api/packages", response_model=PackageOut, status_code=201)
def create_package(body: CreatePackageIn, request: Request, db: Session = Depends(get_db)):
    """Sender: registers the box using the ID on its courier sticker."""
    label_norm = normalize(body.label_code)
    if len(label_norm) < 3:
        raise HTTPException(400, "Sticker ID needs at least 3 letters or digits")
    existing = db.scalar(select(Package).where(Package.label_norm == label_norm))
    if existing:
        raise HTTPException(409, f"A package with sticker ID {existing.label_code} is already registered")
    photo = unused_photo(db, body.photo_id)

    pkg = Package(
        label_code=body.label_code.strip(),
        label_norm=label_norm,
        sender_name=body.sender_name.strip(),
        receiver_name=body.receiver_name.strip(),
        destination=body.destination.strip(),
        description=body.description.strip(),
    )
    pkg.events.append(
        build_event(
            kind="dispatch", request=request, photo=photo, person_name=body.sender_name,
            notes=body.description, matched_by=body.matched_by, location=body.location,
            device_info=body.device_info,
        )
    )
    db.add(pkg)
    db.commit()
    return package_out(load_package(db, pkg.id))


@app.post("/api/packages/{package_id}/deliver", response_model=PackageOut)
def deliver_package(package_id: int, body: DeliverIn, request: Request, db: Session = Depends(get_db)):
    """Receiver: the sticker photo identified this package; record it as delivered."""
    pkg = load_package(db, package_id)
    if pkg.status == "delivered":
        raise HTTPException(409, f"{pkg.label_code} was already marked delivered")
    photo = unused_photo(db, body.photo_id)

    pkg.events.append(
        build_event(
            kind="delivery", request=request, photo=photo,
            person_name=body.receiver_name or pkg.receiver_name, notes=body.notes,
            matched_by=body.matched_by, location=body.location, device_info=body.device_info,
        )
    )
    pkg.status = "delivered"
    pkg.delivered_at = datetime.now(timezone.utc)
    if body.receiver_name.strip() and not pkg.receiver_name:
        pkg.receiver_name = body.receiver_name.strip()
    db.commit()
    return package_out(load_package(db, pkg.id))
