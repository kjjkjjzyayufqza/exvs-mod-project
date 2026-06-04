import { useCallback, useEffect, useState } from "react"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Toaster } from "../components/ui/sonner"
import { TopNavBar } from "@/components/TopNavBar"
import { Outlet, useLocation } from "react-router"
import { cn } from "@/lib/utils"
import { readSidebarOpenMirror, useConfigStore } from "@/store/configStore"

export default function SidebarLayout() {
  const location = useLocation()
  const fullBleedEditor = location.pathname === "/SceneEdit" || location.pathname === "/UnitModelEdit"

  const storeSidebarOpen = useConfigStore((s) => s.sidebarOpen)
  const setSidebarOpen = useConfigStore((s) => s.setSidebarOpen)

  // First paint uses the synchronous localStorage mirror to avoid an
  // expanded->collapsed flicker; the async Tauri store reconciles once loaded.
  const [open, setOpen] = useState<boolean>(() => readSidebarOpenMirror())

  useEffect(() => {
    setOpen(storeSidebarOpen)
  }, [storeSidebarOpen])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      void setSidebarOpen(next)
    },
    [setSidebarOpen],
  )

  return (
    <SidebarProvider open={open} onOpenChange={handleOpenChange}>
      <div className="flex h-svh w-full flex-col pt-[var(--layout-topbar-height)]">
        <TopNavBar />
        <div className="flex min-h-0 min-w-0 flex-1">
          <AppSidebar />
          <main
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
              fullBleedEditor ? "p-0" : "p-4",
            )}
          >
            <Outlet />
          </main>
        </div>
      </div>
      <Toaster />
    </SidebarProvider>
  )
}
