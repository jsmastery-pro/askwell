// The dashboard's nav links. Later phases add items here.

export interface NavItem {
  label: string;
  href: string;
  /** Active only on this exact path (else on the path and anything below it). */
  exact?: boolean;
}

export const DASHBOARD_NAV: readonly NavItem[] = [
  { label: "Projects", href: "/dashboard", exact: true },
  { label: "Billing", href: "/dashboard/billing" },
];

/** Whether `item` is the current page for `pathname`. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
