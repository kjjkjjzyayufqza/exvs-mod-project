import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { FolderTree, Rocket, Swords } from "lucide-react"
import { GuardedNavLink } from "@/components/GuardedNavLink"
import "@/games/ps4-common/i18n"
import { usePs4Preferences, type SidebarGame } from "@/games/ps4-common/preferences"

import {
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
    SidebarSeparator,
    useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { RouterItems } from "../router/router"

type RouterItem = (typeof RouterItems)[number]

function isRouteActive(pathname: string, url: string): boolean {
    if (url === "/") return pathname === "/"
    return pathname === url || pathname.startsWith(`${url}/`)
}

function gameOf(item: RouterItem): SidebarGame {
    return item.game ?? "ob"
}

const SWITCHER: ReadonlyArray<{ game: SidebarGame; icon: typeof FolderTree }> = [
    { game: "ob", icon: FolderTree },
    { game: "mbon", icon: Rocket },
    { game: "gvs", icon: Swords },
]

function MenuItems({ items, pathname }: { items: readonly RouterItem[]; pathname: string }) {
    return (
        <SidebarMenu>
            {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                        asChild
                        isActive={isRouteActive(pathname, item.url)}
                        tooltip={item.title}
                    >
                        <GuardedNavLink to={{ pathname: item.url }}>
                            <item.icon />
                            <span>{item.title}</span>
                        </GuardedNavLink>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
        </SidebarMenu>
    )
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
 *
 * MBON / GVS tools are grouped, switched, listed flat or hidden according to
 * the PS4 sidebar preference (Settings).
 */
export function AppSidebar() {
    const { state } = useSidebar()
    const { pathname } = useLocation()
    const { t } = useTranslation("ps4-workspace")
    const collapsed = state === "collapsed"
    const mode = usePs4Preferences((preferences) => preferences.sidebarMode)
    const sidebarGame = usePs4Preferences((preferences) => preferences.sidebarGame)
    const update = usePs4Preferences((preferences) => preferences.update)
    const hydrate = usePs4Preferences((preferences) => preferences.hydrate)

    useEffect(() => {
        void hydrate()
    }, [hydrate])

    const main = RouterItems.filter((item) => !item.sidebarFooter)
    const footer = RouterItems.filter((item) => item.sidebarFooter)
    const appItems = main.filter((item) => item.app)
    const tools = main.filter((item) => !item.app)
    const toolsOf = (game: SidebarGame) => tools.filter((item) => gameOf(item) === game)

    // The switcher follows navigation into another game's tool.
    const activeItem = main.find((item) => isRouteActive(pathname, item.url))
    const activeGame = activeItem && !activeItem.app ? gameOf(activeItem) : null
    useEffect(() => {
        if (mode === "switcher" && activeGame && activeGame !== sidebarGame) update({ sidebarGame: activeGame })
    }, [mode, activeGame, sidebarGame, update])

    const groupLabel = (game: SidebarGame) => t(`sidebar.group.${game}`)

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
            {mode === "switcher" ? (
                <SidebarHeader className="border-b border-sidebar-border">
                    <div
                        className="flex gap-1 group-data-[collapsible=icon]:flex-col"
                        role="radiogroup"
                        aria-label={t("sidebar.switcher")}
                    >
                        {SWITCHER.map(({ game, icon: Icon }) => (
                            <button
                                key={game}
                                type="button"
                                role="radio"
                                aria-checked={sidebarGame === game}
                                title={groupLabel(game)}
                                className={cn(
                                    "flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors",
                                    sidebarGame === game
                                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent",
                                )}
                                onClick={() => update({ sidebarGame: game })}
                            >
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="group-data-[collapsible=icon]:hidden">{t(`sidebar.short.${game}`)}</span>
                            </button>
                        ))}
                    </div>
                </SidebarHeader>
            ) : null}
            <SidebarContent>
                {mode === "flat" ? (
                    <SidebarGroup>
                        <SidebarGroupContent>
                            <MenuItems items={main} pathname={pathname} />
                        </SidebarGroupContent>
                    </SidebarGroup>
                ) : mode === "grouped" ? (
                    <>
                        {(["ob", "mbon", "gvs"] as const).map((game, index) =>
                            toolsOf(game).length ? (
                                <SidebarGroup key={game} className={index > 0 ? "pt-0" : undefined}>
                                    {index > 0 ? (
                                        <>
                                            <SidebarSeparator className="mx-0 mb-1 hidden group-data-[collapsible=icon]:block" />
                                            <SidebarGroupLabel>{groupLabel(game)}</SidebarGroupLabel>
                                        </>
                                    ) : null}
                                    <SidebarGroupContent>
                                        <MenuItems items={toolsOf(game)} pathname={pathname} />
                                    </SidebarGroupContent>
                                </SidebarGroup>
                            ) : null,
                        )}
                        <SidebarGroup className="pt-0">
                            <SidebarSeparator className="mx-0 mb-1" />
                            <SidebarGroupContent>
                                <MenuItems items={appItems} pathname={pathname} />
                            </SidebarGroupContent>
                        </SidebarGroup>
                    </>
                ) : (
                    <SidebarGroup>
                        <SidebarGroupContent>
                            <MenuItems
                                items={[...toolsOf(mode === "switcher" ? sidebarGame : "ob"), ...appItems]}
                                pathname={pathname}
                            />
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}
            </SidebarContent>
            <SidebarFooter className="border-t border-sidebar-border">
                <SidebarMenu>
                    {footer.map((item) => (
                        <SidebarMenuItem key={item.url}>
                            <SidebarMenuButton asChild isActive={isRouteActive(pathname, item.url)} tooltip={item.title}>
                                <GuardedNavLink to={item.url}><item.icon /><span>{item.title}</span></GuardedNavLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>
            </SidebarFooter>
            <SidebarRail />
        </div>
    )
}
