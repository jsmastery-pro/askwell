import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon or element shown before the label. */
  leading?: ReactNode;
  /** Icon or element shown after the label. */
  trailing?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export type ButtonAsButtonProps = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    href?: undefined;
    /** Shows a spinner and disables the button. */
    loading?: boolean;
  };

export type ButtonAsLinkProps = ButtonBaseProps &
  Omit<ComponentProps<typeof Link>, keyof ButtonBaseProps> & {
    href: ComponentProps<typeof Link>["href"];
    loading?: undefined;
  };

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

const baseClasses =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium " +
  "transition-colors duration-150 outline-none select-none " +
  "focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:opacity-85",
  secondary:
    "border border-line-strong bg-glass text-fg backdrop-blur-glass-sm hover:bg-hover",
  ghost: "text-fg hover:bg-hover",
};

const sizeClasses: Record<ButtonSize, string> = {
  // 40px tall on phones (tap target), compact from `sm` up.
  sm: "h-10 px-3 text-sm sm:h-8",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: Pick<ButtonBaseProps, "variant" | "size" | "className"> = {}): string {
  return cx(baseClasses, variantClasses[variant], sizeClasses[size], className);
}

/** A button, or a link styled as one when `href` is set. */
export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { variant, size, leading, trailing, className, children, loading: _loading, ...linkProps } =
      props;
    return (
      <Link className={buttonClasses({ variant, size, className })} {...linkProps}>
        {leading}
        {children}
        {trailing}
      </Link>
    );
  }

  const {
    variant,
    size,
    leading,
    trailing,
    className,
    children,
    loading = false,
    disabled,
    type = "button",
    ...buttonProps
  } = props;
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...buttonProps}
    >
      {loading ? <Spinner size="sm" label="Loading" /> : leading}
      {children}
      {trailing}
    </button>
  );
}
