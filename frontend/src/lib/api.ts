export type ScanEvent = {
  id: number
  kind: "dispatch" | "delivery"
  person_name: string
  notes: string
  matched_by: string
  photo_url: string
  ocr_text: string
  barcodes: { text: string; format: string }[]
  latitude: number | null
  longitude: number | null
  accuracy_m: number | null
  altitude_m: number | null
  location_error: string
  device_info: Record<string, unknown>
  ip_address: string
  user_agent: string
  created_at: string
}

export type Package = {
  id: number
  label_code: string
  sender_name: string
  receiver_name: string
  destination: string
  description: string
  status: "in_transit" | "delivered"
  created_at: string
  delivered_at: string | null
  distance_km: number | null
  events: ScanEvent[]
}

export type Candidate = {
  value: string
  normalized: string
  label: string
  source: "barcode" | "text"
  priority: number
}

export type PackageMatch = { package: Package; score: number; reason: string }

export type PhotoScan = {
  photo_id: string
  photo_url: string
  text: string
  barcodes: { text: string; format: string }[]
  candidates: Candidate[]
  matches: PackageMatch[]
}

export type Stats = { total: number; in_transit: number; delivered: number }

export type CapturedLocation = {
  latitude?: number
  longitude?: number
  accuracy?: number
  altitude?: number
  error?: string
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (typeof body.detail === "string") message = body.detail
      else if (Array.isArray(body.detail))
        message = body.detail.map((d: { msg: string }) => d.msg).join(", ")
    } catch {
      /* not json */
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

export const api = {
  stats: () => request<Stats>("/api/stats"),

  list: (params: { status?: string; q?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set("status", params.status)
    if (params.q) qs.set("q", params.q)
    return request<Package[]>(`/api/packages?${qs}`)
  },

  /** Uploads the box photo; the server reads the sticker and returns IDs found + matching packages. */
  scanPhoto: (photo: Blob) => {
    const form = new FormData()
    form.append(
      "photo",
      photo,
      photo instanceof File ? photo.name : "photo.jpg"
    )
    return request<PhotoScan>("/api/photos", { method: "POST", body: form })
  },

  create: (input: {
    photo_id: string
    label_code: string
    matched_by: string
    sender_name: string
    receiver_name: string
    destination: string
    description: string
    location: CapturedLocation
    device_info: Record<string, unknown>
  }) => request<Package>("/api/packages", json(input)),

  deliver: (
    packageId: number,
    input: {
      photo_id: string
      matched_by: string
      receiver_name: string
      notes: string
      location: CapturedLocation
      device_info: Record<string, unknown>
    }
  ) => request<Package>(`/api/packages/${packageId}/deliver`, json(input)),
}
