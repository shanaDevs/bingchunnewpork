"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Thin top bar while the pathname changes (Next client navigation). No dependency on a progress library.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    setWidth(18);
    const raf = requestAnimationFrame(() => setWidth(62));
    const grow = window.setTimeout(() => setWidth(88), 120);
    const finish = window.setTimeout(() => {
      setWidth(100);
      window.setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 220);
    }, 380);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(grow);
      window.clearTimeout(finish);
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-0.5 bg-brand-100/40"
    >
      <div
        className="h-full bg-brand-600 shadow-[0_0_12px_rgb(31_98_214/0.45)] transition-[width] duration-200 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
