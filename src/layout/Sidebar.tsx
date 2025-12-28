import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Toaster } from "../components/ui/sonner"
import { TopNavBar } from "@/components/TopNavBar"
import { Outlet } from "react-router"

export default function SidebarLayout() {
  return (
    <>
      <SidebarProvider>
        <div className="flex h-svh w-full">
          <AppSidebar />
          <div className="flex flex-1 flex-col min-w-0">
            <TopNavBar />
            <main className="flex-1 overflow-auto p-6">
              <Outlet />
            </main>
          </div>
        </div>
        <Toaster />
      </SidebarProvider>
    </>
  )
}
