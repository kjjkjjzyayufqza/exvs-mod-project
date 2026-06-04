import { Link, useLocation } from "react-router-dom"

import {
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
    useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { RouterItems } from "../router/router"

function isRouteActive(pathname: string, url: string): boolean {
    if (url === "/") return pathname === "/"
    return pathname === url || pathname.startsWith(`${url}/`)
}

/**
 * In-flow collapsible navigation rail.
 *
 * Rendered inside the layout flex row (below the portaled top bar) rather than
 * with shadcn's fixed `collapsible="icon"` mode, so it stays a normal-flow
 * element that floating modals naturally paint over. The `group` +
 * `data-collapsible="icon"` attributes light up the existing
 * `group-data-[collapsible=icon]:*` rules in the shadcn sidebar primitives
 * (icon-only sizing, truncated labels, hover tooltips).
 */
export function AppSidebar() {
    const { state } = useSidebar()
    const { pathname } = useLocation()
    const collapsed = state === "collapsed"

    return (
        <div
            className={cn(
                "group peer relative z-[var(--z-sidebar)] flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
                "transition-[width] duration-200 ease-linear",
            )}
            data-state={state}
            data-collapsible={collapsed ? "icon" : ""}
            data-side="left"
            style={{
                width: collapsed ? "var(--sidebar-width-icon)" : "var(--sidebar-width)",
            }}
        >
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {RouterItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        isActive={isRouteActive(pathname, item.url)}
                                        tooltip={item.title}
                                    >
                                        <Link to={{ pathname: item.url }}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarRail />
        </div>
    )
}
