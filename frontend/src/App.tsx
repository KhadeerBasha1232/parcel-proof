import { useState } from "react"
import {
  ListIcon,
  MoonIcon,
  PackageCheckIcon,
  SendIcon,
  SunIcon,
} from "lucide-react"

import { PackagesView } from "@/components/packages-view"
import { ReceiveView } from "@/components/receive-view"
import { SendView } from "@/components/send-view"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function App() {
  const [tab, setTab] = useState("send")
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = () => setRefreshKey((k) => k + 1)
  const { theme, setTheme } = useTheme()
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <PackageCheckIcon className="size-4" />
            </div>
            <div className="leading-tight">
              <p className="font-semibold">Parcel Proof</p>
              <p className="text-xs text-muted-foreground">
                Sticker photo + location proof of send and delivery
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(String(v))}
          className="gap-5"
        >
          <TabsList className="w-full">
            <TabsTrigger value="send">
              <SendIcon /> Send
            </TabsTrigger>
            <TabsTrigger value="receive">
              <PackageCheckIcon /> Receive
            </TabsTrigger>
            <TabsTrigger value="packages">
              <ListIcon /> Packages
            </TabsTrigger>
          </TabsList>
          <TabsContent value="send" keepMounted>
            <SendView onCreated={bump} />
          </TabsContent>
          <TabsContent value="receive" keepMounted>
            <ReceiveView onDelivered={bump} />
          </TabsContent>
          <TabsContent value="packages">
            <PackagesView refreshKey={refreshKey} />
          </TabsContent>
        </Tabs>
      </main>
      <Toaster position="top-center" richColors />
    </div>
  )
}

export default App
