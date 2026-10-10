// Button / ButtonLink: the one set of action styles. Every size keeps a 44px touch target
// except `sm`, which is only used inside dense rows that already have a larger hit area.
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import Spinner from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid" | "lime";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium whitespace-nowrap select-none " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px " +
  "disabled:opacity-55 disabled:cursor-not-allowed disabled:active:translate-y-0 cursor-pointer";

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[14px]",
  md: "h-11 px-4 text-[15px]",
  lg: "h-12 px-5 text-base",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-forest text-on-forest hover:bg-forest-deep shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:border-forest/40 hover:bg-surface-muted",
  ghost: "bg-transparent text-ink hover:bg-surface-muted",
  danger: "bg-surface text-brick border border-brick/35 hover:bg-brick-tint",
  "danger-solid": "bg-brick text-white hover:brightness-95",
  lime: "bg-lime text-forest-deep hover:bg-lime-deep",
};

export const buttonClasses = (variant: ButtonVariant = "primary", size: ButtonSize = "md", full = false) =>
  cx(BASE, SIZES[size], VARIANTS[variant], full && "w-full");

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  full?: boolean;
  icon?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, full = false, icon, type = "button", disabled, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClasses(variant, size, full), className)}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon}
      {children}
    </button>
  );
});

export default Button;

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  icon?: ReactNode;
}

export function ButtonLink({ variant = "primary", size = "md", full = false, icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={cx(buttonClasses(variant, size, full), className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
