import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Toaster } from "../components/ui/sonner"
import { TopNavBar } from "@/components/TopNavBar"
import { Outlet, useLocation } from "react-router"
import { cn } from "@/lib/utils"

export default function SidebarLayout() {
  const location = useLocation()
  const sceneEditFullBleed = location.pathname === "/SceneEdit"

  return (
    <>
      <SidebarProvider>
        <div className="flex flex-col h-svh w-full">
          <TopNavBar />
          <div className="flex min-h-0 min-w-0 flex-1">
            <AppSidebar />
            <main
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                sceneEditFullBleed ? "p-0" : "p-4",
              )}
            >
              <Outlet />
            </main>
          </div>
        </div>
        <Toaster />
      </SidebarProvider>
    </>
  )
}
