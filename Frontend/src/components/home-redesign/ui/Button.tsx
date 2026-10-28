import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/components/home-redesign/lib/cn";

type ButtonVariant = "primary" | "secondary" | "inverse";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-snow hover:bg-brand-700 focus-visible:outline-brand-600",
  secondary:
    "bg-white text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50 focus-visible:outline-brand-600",
  // For use on blue backgrounds.
  inverse:
    "bg-white text-brand-700 shadow-lg shadow-brand-950/20 hover:bg-brand-50 focus-visible:outline-white",
};

const baseStyles =
  "inline-flex cursor-pointer items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70";

type LinkButtonProps = Omit<ComponentPropsWithoutRef<typeof Link>, "href"> & { href: string };
type ActionButtonProps = ComponentPropsWithoutRef<"button"> & { href?: undefined };

type ButtonProps = (LinkButtonProps | ActionButtonProps) & {
  variant?: ButtonVariant;
};

/** A link styled as a button when given `href`; otherwise a real <button> for in-page actions. */
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  const classes = cn(baseStyles, variantStyles[variant], className);
  if (props.href !== undefined) {
    return <Link className={classes} {...(props as LinkButtonProps)} />;
  }
  return <button type="button" className={classes} {...(props as ActionButtonProps)} />;
}
