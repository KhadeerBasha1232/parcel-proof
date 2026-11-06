import { useEffect, useRef, useState } from "react"
import {
  CameraIcon,
  ImageUpIcon,
  Loader2Icon,
  MapPinIcon,
  MapPinOffIcon,
  RefreshCwIcon,
  SmartphoneIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { CapturedLocation } from "@/lib/api"
import {
  describeDevice,
  getDeviceInfo,
  getLocation,
  mapLink,
} from "@/lib/capture"

export type Evidence = {
  photo: Blob
  previewUrl: string
  location: CapturedLocation | null // null while still locating
  deviceInfo: Record<string, unknown>
}

const canStream =
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia &&
  window.isSecureContext

/** Takes the photo and, at the same moment, grabs GPS location + device info. */
export function EvidenceCapture({
  value,
  onChange,
  label,
}: {
  value: Evidence | null
  onChange: (value: Evidence | null) => void
  label: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  // keep latest value for async location callbacks
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => () => stopStream(), [])

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  async function openCamera() {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      setCameraOpen(true)
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play()
        }
      })
    } catch (e) {
      setCameraError(e instanceof Error ? e.message : "Could not open camera")
    }
  }

  function closeCamera() {
    stopStream()
    setCameraOpen(false)
  }

  function snap() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d")!.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        closeCamera()
        void accept(
          new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" })
        )
      },
      "image/jpeg",
      0.9
    )
  }

  async function accept(photo: Blob) {
    if (value) URL.revokeObjectURL(value.previewUrl)
    const previewUrl = URL.createObjectURL(photo)
    const deviceInfo = await getDeviceInfo()
    onChange({ photo, previewUrl, location: null, deviceInfo })
    await locate(previewUrl)
  }

  async function locate(previewUrl: string) {
    const current = valueRef.current
    if (current && current.previewUrl === previewUrl && current.location) {
      onChange({ ...current, location: null })
    }
    const location = await getLocation()
    const latest = valueRef.current
    // ignore if the photo was retaken meanwhile
    if (latest && latest.previewUrl === previewUrl)
      onChange({ ...latest, location })
  }

  function clear() {
    if (value) URL.revokeObjectURL(value.previewUrl)
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void accept(file)
          e.target.value = ""
        }}
      />

      {cameraOpen ? (
        <div className="flex flex-col gap-2">
          <div className="overflow-hidden rounded-xl border bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" size="lg" onClick={snap}>
              <CameraIcon data-icon="inline-start" />
              Capture
            </Button>
            <Button variant="outline" size="lg" onClick={closeCamera}>
              Cancel
            </Button>
          </div>
        </div>
      ) : value ? (
        <div className="flex flex-col gap-2">
          <div className="relative overflow-hidden rounded-xl border bg-muted">
            <img
              src={value.previewUrl}
              alt={label}
              className="max-h-80 w-full object-contain"
            />
            <Button
              variant="secondary"
              size="icon-sm"
              className="absolute end-2 top-2"
              onClick={clear}
              aria-label="Remove photo"
            >
              <XIcon />
            </Button>
          </div>
          <LocationLine
            location={value.location}
            onRetry={() => void locate(value.previewUrl)}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <SmartphoneIcon className="size-3.5 shrink-0" />
            {describeDevice(value.deviceInfo)}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <CameraIcon className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">
              Your location and device details are saved with the photo.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {canStream && (
              <Button onClick={openCamera}>
                <CameraIcon data-icon="inline-start" />
                Open camera
              </Button>
            )}
            <Button
              variant={canStream ? "outline" : "default"}
              onClick={() => fileRef.current?.click()}
            >
              <ImageUpIcon data-icon="inline-start" />
              {canStream ? "Upload photo" : "Take photo"}
            </Button>
          </div>
          {cameraError && (
            <p className="text-xs text-destructive">{cameraError}</p>
          )}
        </div>
      )}
    </div>
  )
}

function LocationLine({
  location,
  onRetry,
}: {
  location: CapturedLocation | null
  onRetry: () => void
}) {
  if (!location) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        Getting your location…
      </div>
    )
  }
  if (
    location.error ||
    location.latitude == null ||
    location.longitude == null
  ) {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive">
        <MapPinOffIcon className="size-3.5 shrink-0" />
        <span className="flex-1">{location.error ?? "No location"}</span>
        <Button variant="ghost" size="xs" onClick={onRetry}>
          <RefreshCwIcon data-icon="inline-start" />
          Retry
        </Button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <MapPinIcon className="size-3.5 shrink-0 text-emerald-600" />
      <a
        className="underline-offset-2 hover:underline"
        href={mapLink(location.latitude, location.longitude)}
        target="_blank"
        rel="noreferrer"
      >
        {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
      </a>
      {location.accuracy != null && (
        <span>· ±{Math.round(location.accuracy)} m</span>
      )}
    </div>
  )
}
