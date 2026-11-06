from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Photo(Base):
    """An uploaded photo of the box and what OCR read off its sticker."""

    __tablename__ = "photos"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # uuid hex
    filename: Mapped[str] = mapped_column(String(300))
    ocr_text: Mapped[str] = mapped_column(Text, default="")
    ocr_lines: Mapped[list] = mapped_column(JSON, default=list)
    barcodes: Mapped[list] = mapped_column(JSON, default=list)
    candidates: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Package(Base):
    __tablename__ = "packages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # ID printed on the courier sticker (AWB / tracking / order no.), as shown
    label_code: Mapped[str] = mapped_column(String(100))
    # same ID with spaces/dashes removed and upper-cased, used for matching
    label_norm: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    sender_name: Mapped[str] = mapped_column(String(200))
    receiver_name: Mapped[str] = mapped_column(String(200), default="")
    destination: Mapped[str] = mapped_column(String(500), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    # "in_transit" until the receiver scans the sticker, then "delivered"
    status: Mapped[str] = mapped_column(String(20), default="in_transit", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    events: Mapped[list["ScanEvent"]] = relationship(
        back_populates="package", order_by="ScanEvent.created_at", cascade="all, delete-orphan"
    )


class ScanEvent(Base):
    """One photo + location + device snapshot. 'dispatch' from the sender, 'delivery' from the receiver."""

    __tablename__ = "scan_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    package_id: Mapped[int] = mapped_column(ForeignKey("packages.id"), index=True)
    photo_id: Mapped[str] = mapped_column(ForeignKey("photos.id"))
    kind: Mapped[str] = mapped_column(String(20))
    person_name: Mapped[str] = mapped_column(String(200), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    # how the package was identified from this photo, e.g. "Barcode matched" or "Entered manually"
    matched_by: Mapped[str] = mapped_column(String(200), default="")

    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    altitude_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_error: Mapped[str] = mapped_column(Text, default="")

    device_info: Mapped[dict] = mapped_column(JSON, default=dict)
    ip_address: Mapped[str] = mapped_column(String(64), default="")
    user_agent: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    package: Mapped[Package] = relationship(back_populates="events")
    photo: Mapped[Photo] = relationship()
