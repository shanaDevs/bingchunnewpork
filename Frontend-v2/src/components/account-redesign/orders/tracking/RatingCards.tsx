"use client";

import { Bike, CircleCheck, LoaderCircle, MessageSquareHeart, Star } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { cn } from "@/components/home-redesign/lib/cn";
import { RIDER_RATING_CRITERIA, type RiderRatingCriterionId } from "@/components/order/RiderRatingCard";
import { api, ApiError } from "@/lib/api";
import { card, ErrorText, focusRing, primaryButton } from "../../accountUi";

type SubmittedRating = { stars: number; comment: string | null; createdAt: string };

const STAR_WORDS = ["Poor", "Fair", "Good", "Great", "Excellent"];

/** Five stars to pick from (arrow keys move between them, as radio buttons), with the word for the one chosen. */
function StarPicker({ value, onChange, disabled, label }: { value: number; onChange: (stars: number) => void; disabled?: boolean; label: string }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label={label} className="flex gap-1" onPointerLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((stars) => (
          <button
            key={stars}
            type="button"
            role="radio"
            aria-checked={value === stars}
            aria-label={`${stars} star${stars === 1 ? "" : "s"}, ${STAR_WORDS[stars - 1]}`}
            disabled={disabled}
            onClick={() => onChange(stars)}
            onPointerEnter={() => setHover(stars)}
            className={cn("rounded-lg p-1 transition-transform hover:scale-110 disabled:cursor-not-allowed", focusRing)}
          >
            <Star className={cn("size-8 transition-colors", stars <= shown ? "fill-sun-400 text-amber-500" : "text-slate-300")} aria-hidden="true" />
          </button>
        ))}
      </div>
      {shown > 0 && <span className="text-sm font-bold text-brand-950">{STAR_WORDS[shown - 1]}</span>}
    </div>
  );
}

/** A rating already given: thanks, the stars, and the comment. */
function Thanks({ title, rating, about }: { title: string; rating: SubmittedRating; about: string }) {
  return (
    <section className={cn(card, "bg-emerald-50/60 ring-emerald-200")}>
      <p className="flex items-center gap-2 font-bold text-emerald-900">
        <CircleCheck className="size-5 text-emerald-600" aria-hidden="true" />
        {title}
      </p>
      <p className="mt-2 flex gap-0.5" aria-label={`${rating.stars} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((stars) => (
          <Star key={stars} className={cn("size-6", stars <= rating.stars ? "fill-sun-400 text-amber-500" : "text-slate-300")} aria-hidden="true" />
        ))}
      </p>
      <p className="mt-1 text-sm text-slate-700">
        You rated {about} {rating.stars} out of 5 stars.
      </p>
      {rating.comment && <p className="mt-2 text-sm text-slate-600 italic">&ldquo;{rating.comment}&rdquo;</p>}
    </section>
  );
}

/**
 * Rating the rider, once a delivery has arrived (POST /orders/:id/rider-rating): the stars and what the delivery was
 * like (one or more of the old page's choices; Other asks for a few words), sent together as the comment. A rating
 * already given shows as thanks.
 */
export function RiderRating({ orderAccessId, existing, riderName, onSubmitted }: { orderAccessId: string; existing?: SubmittedRating | null; riderName?: string | null; onSubmitted: () => void }) {
  const [stars, setStars] = useState(0);
  const [chosen, setChosen] = useState<RiderRatingCriterionId[]>([]);
  const [otherText, setOtherText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedRating | null>(existing ?? null);
  const otherChosen = chosen.includes("other");

  if (submitted) return <Thanks title="Thanks for rating your rider!" rating={submitted} about={riderName || "your rider"} />;

  const submit = async () => {
    if (stars < 1) return setProblem("Please select a star rating.");
    if (chosen.length === 0) return setProblem("Please choose at least one delivery experience.");
    if (otherChosen && !otherText.trim()) return setProblem("Please tell us more about the delivery.");
    setBusy(true);
    setProblem(null);
    const comment = chosen.map((id) => (id === "other" ? (otherText.trim() ? `Other: ${otherText.trim()}` : "Other") : (RIDER_RATING_CRITERIA.find((item) => item.id === id)?.label ?? id))).join(" · ");
    try {
      const rating = await api.post<SubmittedRating>(`/orders/${encodeURIComponent(orderAccessId)}/rider-rating`, { stars, comment }, true);
      setSubmitted(rating);
      onSubmitted();
      toast.success("Thank you for rating your rider!");
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Could not submit rider rating.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="rate-rider" className={card}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Bike className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h3 id="rate-rider" className="font-display-condensed text-2xl leading-none text-brand-950 uppercase">
            How was your delivery{riderName ? ` with ${riderName}` : ""}?
          </h3>
          <p className="mt-1 text-sm text-slate-600">You can select more than one.</p>
        </div>
      </div>
      <div className="mt-4">
        <StarPicker
          value={stars}
          onChange={(value) => {
            setStars(value);
            setProblem(null);
          }}
          disabled={busy}
          label="Rate your rider"
        />
      </div>
      <p className="mt-4 text-[0.6875rem] font-semibold tracking-[0.1em] text-slate-500 uppercase">Delivery experience</p>
      <div role="group" aria-label="Delivery experience" className="mt-2 flex flex-wrap gap-2">
        {RIDER_RATING_CRITERIA.map((criterion) => {
          const on = chosen.includes(criterion.id);
          return (
            <button
              key={criterion.id}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => {
                setChosen((list) => (on ? list.filter((id) => id !== criterion.id) : [...list, criterion.id]));
                setProblem(null);
              }}
              className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors", on ? "bg-brand-600 text-snow" : "bg-brand-50 text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100", focusRing)}
            >
              {criterion.label}
            </button>
          );
        })}
      </div>
      {otherChosen && (
        <textarea
          value={otherText}
          onChange={(event) => setOtherText(event.target.value)}
          disabled={busy}
          maxLength={500}
          rows={3}
          placeholder="Tell us about the delivery…"
          aria-label="Other delivery feedback"
          className="mt-3 block w-full resize-none rounded-2xl bg-slate-50 px-4 py-3 text-sm ring-1 ring-slate-200 outline-none ring-inset focus:bg-white focus:ring-2 focus:ring-brand-500"
        />
      )}
      <div aria-live="polite">{problem && <ErrorText>{problem}</ErrorText>}</div>
      <button type="button" onClick={() => void submit()} disabled={busy} className={cn(primaryButton, "mt-4 w-full")}>
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
        Submit rider rating
      </button>
    </section>
  );
}

/**
 * Rating Bing Chun, once a pickup order is ready (POST /orders/:id/rating): the stars and an optional comment. A
 * rating already given shows as thanks.
 */
export function PlatformRating({ orderAccessId, existing, onSubmitted }: { orderAccessId: string; existing?: SubmittedRating | null; onSubmitted: () => void }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedRating | null>(existing ?? null);

  if (submitted) return <Thanks title="Thanks for your feedback!" rating={submitted} about="your experience" />;

  const submit = async () => {
    if (stars < 1) return setProblem("Please select a star rating.");
    setBusy(true);
    setProblem(null);
    try {
      const rating = await api.post<SubmittedRating>(`/orders/${encodeURIComponent(orderAccessId)}/rating`, { stars, comment: comment.trim() || undefined }, true);
      setSubmitted(rating);
      onSubmitted();
      toast.success("Thank you for rating us!");
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Could not submit rating.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="rate-us" className={card}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <MessageSquareHeart className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h3 id="rate-us" className="font-display-condensed text-2xl leading-none text-brand-950 uppercase">
            How was your Bing Chun experience?
          </h3>
          <p className="mt-1 text-sm text-slate-600">Your rating helps us improve the platform for everyone.</p>
        </div>
      </div>
      <div className="mt-4">
        <StarPicker
          value={stars}
          onChange={(value) => {
            setStars(value);
            setProblem(null);
          }}
          disabled={busy}
          label="Rate your experience"
        />
      </div>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        disabled={busy}
        maxLength={500}
        rows={3}
        placeholder="Tell us more (optional)"
        aria-label="Your comment (optional)"
        className="mt-4 block w-full resize-none rounded-2xl bg-slate-50 px-4 py-3 text-sm ring-1 ring-slate-200 outline-none ring-inset focus:bg-white focus:ring-2 focus:ring-brand-500"
      />
      <div aria-live="polite">{problem && <ErrorText>{problem}</ErrorText>}</div>
      <button type="button" onClick={() => void submit()} disabled={busy} className={cn(primaryButton, "mt-4 w-full")}>
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
        Submit rating
      </button>
    </section>
  );
}
