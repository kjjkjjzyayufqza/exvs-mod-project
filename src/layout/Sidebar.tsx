import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Toaster } from "../components/ui/sonner"
import { TopNavBar } from "@/components/TopNavBar"
import { Outlet } from "react-router"

export default function SidebarLayout() {
  return (
    <div className="flex h-svh flex-col">
      <TopNavBar />
      <SidebarProvider className="flex flex-1 min-h-0">
        <AppSidebar />
        <main className="flex flex-1 flex-col bg-background overflow-hidden">
          <div className="min-w-0 p-6 flex-1 overflow-auto">
            <Outlet />
          </div>
        </main>
        <Toaster />
      </SidebarProvider>
    </div>
  )
}
