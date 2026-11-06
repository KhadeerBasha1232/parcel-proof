import {
  BarcodeIcon,
  CheckIcon,
  Loader2Icon,
  RefreshCwIcon,
  ScanTextIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Candidate, PhotoScan } from "@/lib/api"
import { cn } from "@/lib/utils"

/** Shows the IDs read from the sticker. Clicking one calls onPick (when given). */
export function StickerReadout({
  reading,
  scan,
  error,
  onRetry,
  selected,
  onPick,
}: {
  reading: boolean
  scan: PhotoScan | null
  error: string | null
  onRetry: () => void
  selected?: string
  onPick?: (c: Candidate) => void
}) {
  if (reading) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Reading the sticker…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
        <TriangleAlertIcon className="size-4 shrink-0" />
        <span className="flex-1">{error}</span>
        <Button variant="ghost" size="xs" onClick={onRetry}>
          <RefreshCwIcon data-icon="inline-start" />
          Retry
        </Button>
      </div>
    )
  }
  if (!scan) return null

  const norm = selected?.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ScanTextIcon className="size-3.5" />
        {scan.candidates.length
          ? onPick
            ? "IDs found on the sticker. Tap one to use it."
            : "IDs found on the sticker"
          : "No ID found on the sticker. Retake the photo closer, or type the ID."}
      </p>
      {scan.candidates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {scan.candidates.map((c) => {
            const active = norm === c.normalized
            return (
              <button
                key={c.normalized}
                type="button"
                disabled={!onPick}
                onClick={() => onPick?.(c)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-start transition-colors enabled:hover:border-foreground/40",
                  active && "border-primary ring-2 ring-primary/30"
                )}
              >
                {active ? (
                  <CheckIcon className="size-3.5 text-primary" />
                ) : c.source === "barcode" ? (
                  <BarcodeIcon className="size-3.5 text-muted-foreground" />
                ) : null}
                <span className="font-mono text-sm">{c.value}</span>
                <span className="text-[11px] text-muted-foreground">
                  {c.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {scan.text && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">
            All text read from the sticker
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-background p-2 font-sans whitespace-pre-wrap">
            {scan.text}
          </pre>
        </details>
      )}
    </div>
  )
}
