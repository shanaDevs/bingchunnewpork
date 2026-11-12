"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Printer, ReceiptText, Share2, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { homeFontVariables } from "@/components/home-redesign/fonts";
import { cn } from "@/components/home-redesign/lib/cn";
import { api } from "@/lib/api";
import { orderApiPath, rememberOrderTrackToken } from "@/lib/orderTrackSession";
import { getSiteOrigin } from "@/lib/orderLinks";
import type { Order } from "@/types";
import { focusRing } from "../accountUi";
import { receiptHref } from "./orderParts";
import { ReceiptDocument, shareReceipt } from "./ReceiptPage";

/**
 * An order's receipt in a pop-up, so it opens over the page it was asked for from instead of on a page of its own:
 * a native modal <dialog> like the profile and address ones (the page behind is inert, Escape or a click outside
 * closes it), a sheet up from the bottom on phones. Its header has the order number, Share (the receipt page's link,
 * /order/[n]/receipt, which still opens on its own for shared links) and Print, which prints just the receipt as the
 * page does (theme.css, .bc-receipt).
 */
export function ReceiptDialog({ orderNumber, onClose }: { orderNumber: string; onClose: () => void }) {
  const id = useId();
  const { data: order, isLoading, isError } = useQuery<Order>({
    queryKey: ["order", orderNumber, "receipt"],
    queryFn: async () => {
      const data = await api.get<Order>(orderApiPath(orderNumber), false);
      if (data?.orderNumber && data.trackToken) rememberOrderTrackToken(data.orderNumber, data.trackToken);
      return data;
    },
  });

  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const unmounting = useRef(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    unmounting.current = false;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      unmounting.current = true;
      dialog.close();
      document.documentElement.style.removeProperty("overflow");
    };
  }, []);

  const roundButton = cn("grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100", focusRing);

  const printReceipt = () => {
    document.documentElement.classList.add("bc-printing-receipt");
    const cleanup = () => {
      document.documentElement.classList.remove("bc-printing-receipt");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A close the browser forces (e.g. repeated Escape) still leaves the pop-up; skip the one from unmounting.
      onClose={(event) => {
        if (!unmounting.current && !event.currentTarget.open) onClose();
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // Only a press and release both outside the panel; a text selection dragged out of it doesn't close.
        if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
      }}
      // Phones and small tablets: a sheet up from the bottom edge; wider: a centred card.
      // bg-transparent! beats .home-redesign's own white background (unlayered CSS), so the dimmed backdrop shows.
      className={`home-redesign ${homeFontVariables} m-0 h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden bg-transparent! p-0 antialiased backdrop:bg-brand-950/55 backdrop:backdrop-blur-[3px] open:flex md:items-center md:p-4 print:h-auto print:overflow-visible`}
    >
      <div className="relative flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-clip rounded-t-[1.75rem] bg-brand-50/60 text-slate-900 shadow-2xl shadow-brand-950/30 transition-[opacity,translate,scale] duration-300 ease-out starting:translate-y-4 starting:scale-[0.98] starting:opacity-0 md:max-h-[calc(100dvh-2rem)] md:max-w-xl md:rounded-3xl print:max-h-none print:overflow-visible print:shadow-none">
        <header className="flex shrink-0 items-center gap-2 bg-white px-5 py-4 ring-1 ring-brand-100 print:hidden">
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-title`} className="font-display-condensed text-3xl leading-none text-brand-950 uppercase">
              Receipt
            </h2>
            <p className="font-numeric truncate text-sm text-slate-500">#{orderNumber}</p>
          </div>
          {order && (
            <>
              <button type="button" onClick={() => void shareReceipt(order, `${getSiteOrigin()}${receiptHref(order)}`)} aria-label="Share receipt" className={roundButton}>
                <Share2 className="size-[1.125rem]" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={printReceipt}
                className={cn("inline-flex shrink-0 items-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-snow transition-colors hover:bg-brand-700", focusRing)}
              >
                <Printer className="size-4" aria-hidden="true" />
                Print
              </button>
            </>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className={roundButton}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        {/* On the sheet, the receipt's foot stays clear of the iPhone home indicator. */}
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 print:overflow-visible print:p-0">
          {isLoading ? (
            <p role="status" className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500">
              <LoaderCircle className="size-5 animate-spin text-brand-600" aria-hidden="true" />
              Loading receipt…
            </p>
          ) : isError || !order ? (
            <div className="flex flex-col items-center rounded-[1.5rem] bg-white px-6 py-12 text-center ring-1 ring-brand-100">
              <ReceiptText className="size-10 text-brand-300" aria-hidden="true" />
              <p className="mt-3 text-lg font-bold text-brand-950">Receipt not found</p>
            </div>
          ) : (
            <ReceiptDocument order={order} />
          )}
        </div>
      </div>
    </dialog>
  );
}
