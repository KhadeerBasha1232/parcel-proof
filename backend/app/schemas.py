from datetime import datetime

from pydantic import BaseModel, Field


class LocationIn(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    accuracy: float | None = None
    altitude: float | None = None
    error: str = ""


class CreatePackageIn(BaseModel):
    photo_id: str
    label_code: str = Field(min_length=3, max_length=100)
    matched_by: str = ""
    sender_name: str = Field(min_length=1, max_length=200)
    receiver_name: str = ""
    destination: str = ""
    description: str = ""
    location: LocationIn = LocationIn()
    device_info: dict = {}


class DeliverIn(BaseModel):
    photo_id: str
    matched_by: str = ""
    receiver_name: str = ""
    notes: str = ""
    location: LocationIn = LocationIn()
    device_info: dict = {}


class ScanEventOut(BaseModel):
    id: int
    kind: str
    person_name: str
    notes: str
    matched_by: str
    photo_url: str
    ocr_text: str
    barcodes: list
    latitude: float | None
    longitude: float | None
    accuracy_m: float | None
    altitude_m: float | None
    location_error: str
    device_info: dict
    ip_address: str
    user_agent: str
    created_at: datetime


class PackageOut(BaseModel):
    id: int
    label_code: str
    sender_name: str
    receiver_name: str
    destination: str
    description: str
    status: str
    created_at: datetime
    delivered_at: datetime | None
    # straight-line distance between dispatch and delivery photos, when both have GPS
    distance_km: float | None
    events: list[ScanEventOut]


class Candidate(BaseModel):
    value: str
    normalized: str
    label: str
    source: str
    priority: int


class PackageMatch(BaseModel):
    package: PackageOut
    score: float
    reason: str


class PhotoScanOut(BaseModel):
    photo_id: str
    photo_url: str
    text: str
    barcodes: list
    candidates: list[Candidate]
    # existing packages whose sticker ID shows up in this photo, best first
    matches: list[PackageMatch]


class StatsOut(BaseModel):
    total: int
    in_transit: int
    delivered: int
