import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Toaster } from "../components/ui/sonner"
import { TopNavBar } from "@/components/TopNavBar"

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <TopNavBar />
      <div className="flex w-full h-screen pt-10">
        <AppSidebar />
        <main className="flex flex-col w-full h-full overflow-auto">
          <SidebarTrigger />
          {children}
        </main>
      </div>
      <Toaster />
    </SidebarProvider>
  )
}
