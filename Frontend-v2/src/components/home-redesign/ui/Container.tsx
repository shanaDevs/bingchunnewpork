import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@/components/home-redesign/lib/cn";

type ContainerProps<T extends ElementType> = {
  as?: T;
} & ComponentPropsWithoutRef<T>;

/** Centred, max-width wrapper with consistent horizontal padding. */
export function Container<T extends ElementType = "div">({
  as,
  className,
  ...props
}: ContainerProps<T>) {
  const Component = as ?? "div";
  return (
    <Component
      className={cn("mx-auto w-full max-w-site px-5 sm:px-8 lg:px-12", className)}
      {...props}
    />
  );
}
