import { useEffect, useState } from "react"
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  PackageOpenIcon,
  SearchIcon,
} from "lucide-react"

import {
  EventTimeline,
  PackageSummary,
  StatusBadge,
} from "@/components/package-detail"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { api, type Package, type Stats } from "@/lib/api"
import { formatDate } from "@/lib/capture"
import { cn } from "@/lib/utils"

const filters = [
  { value: "", label: "All" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
] as const

export function PackagesView({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [items, setItems] = useState<Package[] | null>(null)
  const [status, setStatus] = useState("")
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<Package | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch(() => {})
  }, [refreshKey])

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      api
        .list({ status, q })
        .then((r) => {
          if (!cancelled) {
            setItems(r)
            setError(null)
          }
        })
        .catch((e: Error) => !cancelled && setError(e.message))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [status, q, refreshKey])

  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setSelected(null)}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          All packages
        </Button>
        <Card>
          <CardContent>
            <PackageSummary pkg={selected} />
          </CardContent>
        </Card>
        <EventTimeline events={selected.events} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total" value={stats?.total} />
        <Stat label="In transit" value={stats?.in_transit} />
        <Stat label="Delivered" value={stats?.delivered} accent />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code, name, destination"
            className="ps-8"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-[3px]">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={cn(
                "flex-1 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors",
                status === f.value && "bg-background text-foreground shadow-sm"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Could not load packages: {error}. Is the backend running?
        </p>
      ) : items === null ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <PackageOpenIcon className="size-8" />
          <p>No packages yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
          {items.map((p) => {
            const dispatch = p.events.find((e) => e.kind === "dispatch")
            return (
              <li key={p.id}>
                <button
                  onClick={() => setSelected(p)}
                  className="flex w-full items-center gap-3 p-3 text-start transition-colors hover:bg-muted/50"
                >
                  {dispatch ? (
                    <img
                      src={dispatch.photo_url}
                      alt=""
                      className="size-14 shrink-0 rounded-lg border object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="size-14 shrink-0 rounded-lg bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">
                        {p.label_code}
                      </span>
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="truncate text-sm">
                      {p.sender_name}
                      {p.receiver_name && <> → {p.receiver_name}</>}
                      {p.destination && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {p.destination}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sent {formatDate(p.created_at)}
                      {p.delivered_at && (
                        <> · Delivered {formatDate(p.delivered_at)}</>
                      )}
                    </p>
                  </div>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value?: number
  accent?: boolean
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          accent && "text-emerald-600 dark:text-emerald-400"
        )}
      >
        {value ?? "–"}
      </p>
    </div>
  )
}
