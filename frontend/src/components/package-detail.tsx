import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  MapPinIcon,
  MapPinOffIcon,
  PackageIcon,
  RouteIcon,
  ScanTextIcon,
  TruckIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { Package, ScanEvent } from "@/lib/api"
import { describeDevice, formatDate, mapLink } from "@/lib/capture"

export function StatusBadge({ status }: { status: Package["status"] }) {
  return status === "delivered" ? (
    <Badge className="bg-emerald-600 text-white dark:bg-emerald-500">
      <CheckCircle2Icon data-icon="inline-start" />
      Delivered
    </Badge>
  ) : (
    <Badge variant="secondary">
      <TruckIcon data-icon="inline-start" />
      In transit
    </Badge>
  )
}

export function PackageSummary({ pkg }: { pkg: Package }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PackageIcon className="size-4 text-muted-foreground" />
          <span className="font-mono font-semibold tracking-wide">
            {pkg.label_code}
          </span>
        </div>
        <StatusBadge status={pkg.status} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">From</dt>
        <dd>{pkg.sender_name}</dd>
        {pkg.receiver_name && (
          <>
            <dt className="text-muted-foreground">To</dt>
            <dd>{pkg.receiver_name}</dd>
          </>
        )}
        {pkg.destination && (
          <>
            <dt className="text-muted-foreground">Destination</dt>
            <dd>{pkg.destination}</dd>
          </>
        )}
        {pkg.description && (
          <>
            <dt className="text-muted-foreground">Contents</dt>
            <dd>{pkg.description}</dd>
          </>
        )}
        {pkg.distance_km != null && (
          <>
            <dt className="text-muted-foreground">Distance</dt>
            <dd className="flex items-center gap-1">
              <RouteIcon className="size-3.5" />
              {pkg.distance_km < 1
                ? `${Math.round(pkg.distance_km * 1000)} m`
                : `${pkg.distance_km.toFixed(1)} km`}{" "}
              between sent and delivered photos
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}

export function EventTimeline({ events }: { events: ScanEvent[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {events.map((e) => (
        <li key={e.id}>
          <EventCard event={e} />
        </li>
      ))}
    </ol>
  )
}

function EventCard({ event: e }: { event: ScanEvent }) {
  const hasGps = e.latitude != null && e.longitude != null
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {e.kind === "dispatch" ? (
            <TruckIcon className="size-4" />
          ) : (
            <CheckCircle2Icon className="size-4 text-emerald-600" />
          )}
          {e.kind === "dispatch" ? "Sent" : "Delivered"}
          {e.person_name && (
            <span className="font-normal text-muted-foreground">
              by {e.person_name}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDate(e.created_at)}
        </span>
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,220px)_1fr]">
        <a
          href={e.photo_url}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-lg border bg-muted"
        >
          <img
            src={e.photo_url}
            alt={`${e.kind} photo`}
            className="aspect-[4/3] w-full object-cover"
            loading="lazy"
          />
        </a>
        <div className="flex min-w-0 flex-col gap-2 text-xs">
          {hasGps ? (
            <>
              <a
                href={mapLink(e.latitude!, e.longitude!)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 font-medium underline-offset-2 hover:underline"
              >
                <MapPinIcon className="size-3.5 text-emerald-600" />
                {e.latitude!.toFixed(6)}, {e.longitude!.toFixed(6)}
                {e.accuracy_m != null && (
                  <span className="font-normal text-muted-foreground">
                    ±{Math.round(e.accuracy_m)} m
                  </span>
                )}
                <ExternalLinkIcon className="size-3" />
              </a>
              <iframe
                title="Map"
                className="h-32 w-full rounded-md border"
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${e.longitude! - 0.005},${e.latitude! - 0.003},${e.longitude! + 0.005},${e.latitude! + 0.003}&layer=mapnik&marker=${e.latitude},${e.longitude}`}
              />
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-destructive">
              <MapPinOffIcon className="size-3.5" />
              No GPS{e.location_error ? `: ${e.location_error}` : ""}
            </div>
          )}
          {e.matched_by && (
            <p className="flex items-center gap-1.5">
              <ScanTextIcon className="size-3.5" />
              Identified by: {e.matched_by}
            </p>
          )}
          {e.notes && <p className="text-sm">{e.notes}</p>}
          <p className="text-muted-foreground">
            {describeDevice(e.device_info)} · IP {e.ip_address || "unknown"}
          </p>
          <details className="text-muted-foreground">
            <summary className="cursor-pointer select-none">
              Sticker text read by OCR
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 font-sans text-[11px] leading-snug whitespace-pre-wrap">
              {[
                ...e.barcodes.map((b) => `[${b.format}] ${b.text}`),
                e.ocr_text || "(no text found)",
              ].join("\n")}
            </pre>
          </details>
          <details className="text-muted-foreground">
            <summary className="cursor-pointer select-none">
              All device info
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-snug">
              {JSON.stringify(
                { ...e.device_info, serverUserAgent: e.user_agent },
                null,
                2
              )}
            </pre>
          </details>
        </div>
      </div>
    </div>
  )
}
