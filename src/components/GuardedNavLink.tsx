import { type ComponentProps, type MouseEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useNavigationGuard } from "@/layout/NavigationGuardContext";

type GuardedNavLinkProps = ComponentProps<typeof Link>;

function targetPath(to: GuardedNavLinkProps["to"], pathname: string): string | null {
  if (typeof to === "string") return to;
  if (typeof to === "object" && to && "pathname" in to && typeof to.pathname === "string") return to.pathname;
  return pathname;
}

export function GuardedNavLink({ to, onClick, ...props }: GuardedNavLinkProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { requestNavigation } = useNavigationGuard();
  return (
    <Link
      to={to}
      {...props}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        const next = targetPath(to, pathname);
        if (!next || next === pathname) return;
        event.preventDefault();
        requestNavigation(() => navigate(to));
      }}
    />
  );
}
