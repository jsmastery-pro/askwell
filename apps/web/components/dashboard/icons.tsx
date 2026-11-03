import type { SVGProps } from "react";

const iconProps: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

/** Three lines: open the menu. */
export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

/** An X: close the menu. */
export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

/** A sun: light theme. */
export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/** A crescent moon: dark theme. */
export function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />
    </svg>
  );
}

/** A monitor: follow the system setting. */
export function MonitorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
