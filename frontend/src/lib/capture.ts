import type { CapturedLocation } from "./api"

export function getLocation(timeoutMs = 20000): Promise<CapturedLocation> {
  return new Promise((resolve) => {
    if (!window.isSecureContext) {
      resolve({
        error:
          "Location needs https or localhost. Open the app over https (npm run both:https).",
      })
      return
    }
    if (!("geolocation" in navigator)) {
      resolve({ error: "This browser does not support location" })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude ?? undefined,
        }),
      (err) => {
        const reasons: Record<number, string> = {
          1: "Location permission was denied",
          2: "Location is unavailable",
          3: "Timed out getting location",
        }
        resolve({ error: reasons[err.code] ?? err.message })
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    )
  })
}

type NavigatorExtras = Omit<Navigator, "userAgentData"> & {
  deviceMemory?: number
  connection?: {
    effectiveType?: string
    downlink?: number
    rtt?: number
    saveData?: boolean
    type?: string
  }
  getBattery?: () => Promise<{ level: number; charging: boolean }>
  userAgentData?: {
    brands: { brand: string; version: string }[]
    mobile: boolean
    platform: string
    getHighEntropyValues: (hints: string[]) => Promise<Record<string, unknown>>
  }
}

/** Snapshot of everything the browser will tell us about the device. */
export async function getDeviceInfo(): Promise<Record<string, unknown>> {
  const nav = navigator as unknown as NavigatorExtras
  const info: Record<string, unknown> = {
    userAgent: nav.userAgent,
    platform: nav.platform,
    vendor: nav.vendor,
    language: nav.language,
    languages: [...(nav.languages ?? [])],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffsetMin: new Date().getTimezoneOffset(),
    screen: {
      width: screen.width,
      height: screen.height,
      pixelRatio: window.devicePixelRatio,
      colorDepth: screen.colorDepth,
      orientation: screen.orientation?.type,
    },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemoryGb: nav.deviceMemory,
    maxTouchPoints: nav.maxTouchPoints,
    online: nav.onLine,
    capturedAt: new Date().toISOString(),
  }

  if (nav.connection) {
    const c = nav.connection
    info.connection = {
      type: c.type,
      effectiveType: c.effectiveType,
      downlinkMbps: c.downlink,
      rttMs: c.rtt,
      saveData: c.saveData,
    }
  }

  if (nav.userAgentData) {
    info.brands = nav.userAgentData.brands
    info.mobile = nav.userAgentData.mobile
    info.uaPlatform = nav.userAgentData.platform
    try {
      const high = await nav.userAgentData.getHighEntropyValues([
        "model",
        "platformVersion",
        "architecture",
        "bitness",
        "fullVersionList",
      ])
      Object.assign(info, {
        model: high.model,
        platformVersion: high.platformVersion,
        architecture: high.architecture,
        bitness: high.bitness,
        fullVersionList: high.fullVersionList,
      })
    } catch {
      /* not allowed */
    }
  }

  if (nav.getBattery) {
    try {
      const b = await nav.getBattery()
      info.battery = {
        levelPct: Math.round(b.level * 100),
        charging: b.charging,
      }
    } catch {
      /* not allowed */
    }
  }

  return info
}

/** Short human label like "Android 14 · Pixel 8 · Chrome". */
export function describeDevice(info: Record<string, unknown>): string {
  const ua = String(info.userAgent ?? "")
  const parts: string[] = []
  const os =
    (info.uaPlatform as string) ||
    (/Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "")
  if (os) {
    const major = Number(String(info.platformVersion ?? "").split(".")[0])
    let version = info.platformVersion ? String(major) : ""
    // Chrome reports Windows 11 as platformVersion 13+, Windows 10 as 1-12
    if (os === "Windows" && info.platformVersion)
      version = major >= 13 ? "11" : "10"
    parts.push(version ? `${os} ${version}` : os)
  }
  if (info.model) parts.push(String(info.model))
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : ""
  if (browser) parts.push(browser)
  return parts.join(" · ") || "Unknown device"
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function mapLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`
}
