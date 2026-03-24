import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Toaster } from "../components/ui/sonner"
import { TopNavBar } from "@/components/TopNavBar"
import { Outlet } from "react-router"

export default function SidebarLayout() {
  return (
    <>
      <SidebarProvider>
        <div className="flex flex-col h-svh w-full">
          <TopNavBar />
          <div className="flex flex-1 min-h-0">
            <AppSidebar />
            <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
              <Outlet />
            </main>
          </div>
        </div>
        <Toaster />
      </SidebarProvider>
    </>
  )
}
