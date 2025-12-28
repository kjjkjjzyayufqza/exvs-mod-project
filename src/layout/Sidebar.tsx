import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Toaster } from "../components/ui/sonner"
import { TopNavBar } from "@/components/TopNavBar"

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNavBar />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex min-w-0 flex-col h-screen overflow-hidden">
          <div className="min-w-0 p-6">
            {children}
          </div>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </>
  )
}
