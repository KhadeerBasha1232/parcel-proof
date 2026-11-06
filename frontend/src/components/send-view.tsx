import { useState } from "react"
import {
  CheckCircle2Icon,
  Loader2Icon,
  PlusIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { toast } from "sonner"

import { EvidenceCapture, type Evidence } from "@/components/evidence-capture"
import { EventTimeline, PackageSummary } from "@/components/package-detail"
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
import { Textarea } from "@/components/ui/textarea"
import { api, type Candidate, type Package, type PhotoScan } from "@/lib/api"
import { useStickerScan } from "@/lib/use-sticker-scan"

const emptyForm = {
  sender_name: "",
  receiver_name: "",
  destination: "",
  description: "",
}
const norm = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "")

function savedSenderName() {
  try {
    return localStorage.getItem("senderName") ?? ""
  } catch {
    return ""
  }
}

export function SendView({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    sender_name: savedSenderName(),
  }))
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [labelCode, setLabelCode] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<Package | null>(null)

  const sticker = useStickerScan(evidence, (scan: PhotoScan) => {
    // prefill with the most likely ID (barcode > AWB/tracking > order > invoice)
    setLabelCode(scan.candidates[0]?.value ?? "")
  })

  const locating = evidence !== null && evidence.location === null
  const alreadyRegistered = sticker.scan?.matches.find(
    (m) =>
      m.package.label_code && norm(m.package.label_code) === norm(labelCode)
  )
  const canSubmit =
    !!evidence &&
    !!sticker.scan &&
    !locating &&
    norm(labelCode).length >= 3 &&
    form.sender_name.trim() !== "" &&
    !submitting

  function matchedBy(): string {
    const c = sticker.scan?.candidates.find(
      (x: Candidate) => x.normalized === norm(labelCode)
    )
    if (!c) return "Entered manually"
    return c.source === "barcode"
      ? `Read from ${c.label.toLowerCase()}`
      : `Read from sticker text (${c.label})`
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!evidence?.location || !sticker.scan) return
    setSubmitting(true)
    try {
      const pkg = await api.create({
        ...form,
        photo_id: sticker.scan.photo_id,
        label_code: labelCode.trim(),
        matched_by: matchedBy(),
        location: evidence.location,
        device_info: evidence.deviceInfo,
      })
      try {
        localStorage.setItem("senderName", form.sender_name)
      } catch {
        /* storage blocked */
      }
      setCreated(pkg)
      onCreated()
      toast.success(`Package ${pkg.label_code} registered`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save package")
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    if (evidence) URL.revokeObjectURL(evidence.previewUrl)
    setEvidence(null)
    setCreated(null)
    setLabelCode("")
    setForm({ ...emptyForm, sender_name: form.sender_name })
  }

  if (created) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-4 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2Icon className="size-6 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Package registered</p>
            <p className="text-sm opacity-80">
              The receiver just photographs the same sticker when the box
              arrives.
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <PackageSummary pkg={created} />
            <Button variant="outline" className="self-start" onClick={reset}>
              <PlusIcon data-icon="inline-start" />
              Send another
            </Button>
          </CardContent>
        </Card>
        <EventTimeline events={created.events} />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send a package</CardTitle>
        <CardDescription>
          Photograph the box so the courier sticker and bill are readable. We
          read the ID off the sticker and save the photo, your location and your
          device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <EvidenceCapture
            label="Photo of the box with its sticker"
            value={evidence}
            onChange={setEvidence}
          />

          {evidence && (
            <div className="flex flex-col gap-2">
              <StickerReadout
                reading={sticker.reading}
                scan={sticker.scan}
                error={sticker.error}
                onRetry={sticker.retry}
                selected={labelCode}
                onPick={(c) => setLabelCode(c.value)}
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="label">
                  Sticker ID (AWB / tracking / order no.) *
                </Label>
                <Input
                  id="label"
                  value={labelCode}
                  onChange={(e) => setLabelCode(e.target.value)}
                  placeholder={
                    sticker.reading
                      ? "Reading…"
                      : "Type the ID printed on the sticker"
                  }
                  className="font-mono"
                  disabled={sticker.reading}
                />
                {alreadyRegistered && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <TriangleAlertIcon className="size-3.5" />
                    This ID is already registered (sent by{" "}
                    {alreadyRegistered.package.sender_name}).
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name *" id="sender">
              <Input
                id="sender"
                required
                value={form.sender_name}
                onChange={(e) =>
                  setForm({ ...form, sender_name: e.target.value })
                }
                placeholder="Sender name"
              />
            </Field>
            <Field label="Receiver name" id="receiver">
              <Input
                id="receiver"
                value={form.receiver_name}
                onChange={(e) =>
                  setForm({ ...form, receiver_name: e.target.value })
                }
                placeholder="Who will receive it"
              />
            </Field>
            <Field
              label="Destination"
              id="destination"
              className="sm:col-span-2"
            >
              <Input
                id="destination"
                value={form.destination}
                onChange={(e) =>
                  setForm({ ...form, destination: e.target.value })
                }
                placeholder="Address or city"
              />
            </Field>
            <Field
              label="Contents / notes"
              id="description"
              className="sm:col-span-2"
            >
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="e.g. 2 items, fragile"
              />
            </Field>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit || !!alreadyRegistered}
          >
            {submitting || locating || sticker.reading ? (
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
            ) : (
              <SendIcon data-icon="inline-start" />
            )}
            {submitting
              ? "Saving…"
              : sticker.reading
                ? "Reading sticker…"
                : locating
                  ? "Waiting for location…"
                  : "Register package"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  id,
  className,
  children,
}: {
  label: string
  id: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
