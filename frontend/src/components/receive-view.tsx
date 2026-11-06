import { useState } from "react"
import {
  CheckCircle2Icon,
  Loader2Icon,
  PackageCheckIcon,
  PackageSearchIcon,
  RotateCcwIcon,
  SearchIcon,
} from "lucide-react"
import { toast } from "sonner"

import { EvidenceCapture, type Evidence } from "@/components/evidence-capture"
import {
  EventTimeline,
  PackageSummary,
  StatusBadge,
} from "@/components/package-detail"
import { StickerReadout } from "@/components/sticker-readout"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { api, type Package, type PhotoScan } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useStickerScan } from "@/lib/use-sticker-scan"

type Choice = { pkg: Package; reason: string }

export function ReceiveView({ onDelivered }: { onDelivered: () => void }) {
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [receiverName, setReceiverName] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [delivered, setDelivered] = useState<Package | null>(null)

  function choose(c: Choice | null) {
    setChoice(c)
    setReceiverName(c?.pkg.receiver_name ?? "")
  }

  const sticker = useStickerScan(evidence, (scan: PhotoScan) => {
    const best = scan.matches.find((m) => m.package.status === "in_transit")
    choose(best ? { pkg: best.package, reason: best.reason } : null)
  })

  function changePhoto(next: Evidence | null) {
    setEvidence(next)
    choose(null)
  }

  function reset() {
    if (evidence) URL.revokeObjectURL(evidence.previewUrl)
    setEvidence(null)
    choose(null)
    setNotes("")
    setDelivered(null)
  }

  const locating = evidence !== null && evidence.location === null

  async function confirm() {
    if (!choice || !evidence?.location || !sticker.scan) return
    setSubmitting(true)
    try {
      const updated = await api.deliver(choice.pkg.id, {
        photo_id: sticker.scan.photo_id,
        matched_by: choice.reason,
        receiver_name: receiverName,
        notes,
        location: evidence.location,
        device_info: evidence.deviceInfo,
      })
      setDelivered(updated)
      onDelivered()
      toast.success(`${updated.label_code} marked as delivered`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm delivery")
    } finally {
      setSubmitting(false)
    }
  }

  if (delivered) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-4 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2Icon className="size-6 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Delivery confirmed</p>
            <p className="text-sm opacity-80">
              Photo, location and device info saved.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcwIcon data-icon="inline-start" />
            Next box
          </Button>
        </div>
        <Card>
          <CardContent>
            <PackageSummary pkg={delivered} />
          </CardContent>
        </Card>
        <EventTimeline events={delivered.events} />
      </div>
    )
  }

  const matches = sticker.scan?.matches ?? []

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Receive a package</CardTitle>
          <CardDescription>
            Photograph the courier sticker on the box. We read its ID and find
            the package. Your photo, location and device are saved as proof of
            delivery.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <EvidenceCapture
            label="Photo of the sticker on the box"
            value={evidence}
            onChange={changePhoto}
          />
          {evidence && (
            <StickerReadout
              reading={sticker.reading}
              scan={sticker.scan}
              error={sticker.error}
              onRetry={sticker.retry}
            />
          )}

          {sticker.scan && (
            <div className="flex flex-col gap-2">
              {matches.length > 0 ? (
                <>
                  <p className="text-sm font-medium">
                    {matches.length === 1
                      ? "Matching package"
                      : `${matches.length} matching packages, pick one`}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {matches.map((m) => (
                      <li key={m.package.id}>
                        <PackageOption
                          pkg={m.package}
                          reason={m.reason}
                          active={choice?.pkg.id === m.package.id}
                          onClick={() =>
                            m.package.status === "in_transit" &&
                            choose({ pkg: m.package, reason: m.reason })
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  <PackageSearchIcon className="size-4 shrink-0" />
                  No registered package matches this sticker. Retake the photo
                  closer, or search below.
                </p>
              )}
              <ManualSearch
                onPick={(pkg) => choose({ pkg, reason: "Selected manually" })}
                activeId={choice?.pkg.id}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {choice && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm delivery</CardTitle>
            <CardDescription>
              Compare the sender's photo with the box in your hands.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <PhotoTile
                label="When sent"
                src={
                  choice.pkg.events.find((e) => e.kind === "dispatch")
                    ?.photo_url
                }
              />
              <PhotoTile label="Now" src={evidence?.previewUrl} />
            </div>
            <PackageSummary pkg={choice.pkg} />
            <p className="text-xs text-muted-foreground">
              Identified by: {choice.reason}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rname">Received by</Label>
              <Input
                id="rname"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rnotes">Notes</Label>
              <Textarea
                id="rnotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Condition of the box, anything missing…"
              />
            </div>
            <Button
              size="lg"
              onClick={confirm}
              disabled={locating || submitting}
            >
              {submitting || locating ? (
                <Loader2Icon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <PackageCheckIcon data-icon="inline-start" />
              )}
              {submitting
                ? "Saving…"
                : locating
                  ? "Waiting for location…"
                  : "Mark as delivered"}
            </Button>
            <Separator />
            <EventTimeline events={choice.pkg.events} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PackageOption({
  pkg,
  reason,
  active,
  onClick,
}: {
  pkg: Package
  reason?: string
  active: boolean
  onClick: () => void
}) {
  const thumb = pkg.events.find((e) => e.kind === "dispatch")?.photo_url
  const delivered = pkg.status === "delivered"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={delivered}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border p-2 text-start transition-colors enabled:hover:bg-muted/50 disabled:opacity-70",
        active && "border-primary ring-2 ring-primary/30"
      )}
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="size-12 shrink-0 rounded-md border object-cover"
        />
      ) : (
        <div className="size-12 shrink-0 rounded-md bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">
            {pkg.label_code}
          </span>
          <StatusBadge status={pkg.status} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {pkg.sender_name}
          {pkg.receiver_name && <> → {pkg.receiver_name}</>}
          {reason && <> · {reason}</>}
          {delivered && <> · already delivered</>}
        </p>
      </div>
    </button>
  )
}

function ManualSearch({
  onPick,
  activeId,
}: {
  onPick: (pkg: Package) => void
  activeId?: number
}) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Package[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    setBusy(true)
    try {
      setResults(await api.list({ q, status: "in_transit" }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground select-none">
        Search for the package yourself
      </summary>
      <form onSubmit={search} className="mt-2 flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sticker ID, sender or receiver name"
        />
        <Button type="submit" variant="secondary" disabled={busy || !q.trim()}>
          {busy ? (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          ) : (
            <SearchIcon data-icon="inline-start" />
          )}
          Search
        </Button>
      </form>
      {results && (
        <ul className="mt-2 flex flex-col gap-2">
          {results.length === 0 && (
            <li className="text-muted-foreground">
              No packages in transit match.
            </li>
          )}
          {results.map((p) => (
            <li key={p.id}>
              <PackageOption
                pkg={p}
                active={activeId === p.id}
                onClick={() => onPick(p)}
              />
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

function PhotoTile({ label, src }: { label: string; src?: string }) {
  return (
    <figure className="flex flex-col gap-1">
      <div className="overflow-hidden rounded-lg border bg-muted">
        {src ? (
          <img
            src={src}
            alt={label}
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <div className="aspect-[4/3]" />
        )}
      </div>
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  )
}
