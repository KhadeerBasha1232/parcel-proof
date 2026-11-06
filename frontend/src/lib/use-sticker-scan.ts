import { useEffect, useRef, useState } from "react"

import type { Evidence } from "@/components/evidence-capture"
import { api, type PhotoScan } from "@/lib/api"

type Result = { key: string; scan?: PhotoScan; error?: string }

/** Uploads each new photo as soon as it is taken and returns what the server read off the sticker. */
export function useStickerScan(
  evidence: Evidence | null,
  onScan?: (scan: PhotoScan) => void
) {
  const [result, setResult] = useState<Result | null>(null)
  const [attempt, setAttempt] = useState(0)
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const photo = evidence?.photo
  const key = evidence ? `${evidence.previewUrl}#${attempt}` : null

  useEffect(() => {
    if (!photo || !key) return
    let cancelled = false
    api
      .scanPhoto(photo)
      .then((scan) => {
        if (cancelled) return
        setResult({ key, scan })
        onScanRef.current?.(scan)
      })
      .catch((e: Error) => !cancelled && setResult({ key, error: e.message }))
    return () => {
      cancelled = true
    }
  }, [photo, key])

  const current = key && result?.key === key ? result : null
  return {
    reading: key !== null && current === null,
    scan: current?.scan ?? null,
    error: current?.error ?? null,
    retry: () => setAttempt((a) => a + 1),
  }
}
