'use client';

import { useState } from 'react';
import { Bike, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

import StarRatingInput, { StarRatingDisplay } from '@/components/ui/StarRatingInput';
import { api, ApiError } from '@/lib/api';

export const RIDER_RATING_CRITERIA = [
  { id: 'on_time', label: 'Delivered on time' },
  { id: 'food_handled_well', label: 'Food handled carefully' },
  { id: 'packaging_intact', label: 'Packaging intact' },
  { id: 'polite', label: 'Polite & friendly' },
  { id: 'followed_instructions', label: 'Followed instructions' },
  { id: 'easy_to_find', label: 'Easy to find / contact' },
  { id: 'other', label: 'Other' },
] as const;

export type RiderRatingCriterionId = (typeof RIDER_RATING_CRITERIA)[number]['id'];

type SubmittedRating = {
  stars: number;
  comment: string | null;
  createdAt: string;
};

type Props = {
  orderAccessId: string;
  existingRating?: SubmittedRating | null;
  riderName?: string | null;
  onSubmitted?: (rating: SubmittedRating) => void;
};

function buildComment(
  selectedIds: RiderRatingCriterionId[],
  otherText: string,
): string | undefined {
  if (selectedIds.length === 0) return undefined;

  const parts: string[] = [];
  for (const id of selectedIds) {
    if (id === 'other') {
      const trimmed = otherText.trim();
      parts.push(trimmed ? `Other: ${trimmed}` : 'Other');
      continue;
    }
    const label = RIDER_RATING_CRITERIA.find((c) => c.id === id)?.label ?? id;
    parts.push(label);
  }
  return parts.join(' · ');
}

export default function RiderRatingCard({
  orderAccessId,
  existingRating = null,
  riderName = null,
  onSubmitted,
}: Props) {
  const [stars, setStars] = useState(0);
  const [selectedIds, setSelectedIds] = useState<RiderRatingCriterionId[]>([]);
  const [otherText, setOtherText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmittedRating | null>(existingRating);

  const otherSelected = selectedIds.includes('other');

  function toggleCriterion(id: RiderRatingCriterionId) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  if (submitted) {
    return (
      <div className="card mb-5 border border-green-500/20 bg-green-500/5 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-400" />
          <div>
            <p className="font-semibold text-white">Thanks for rating your rider!</p>
            <StarRatingDisplay value={submitted.stars} size={22} className="mt-2 justify-start" />
            <p className="mt-1 text-sm text-muted">
              You rated {riderName ? riderName : 'your rider'} {submitted.stars} out of 5 stars.
            </p>
            {submitted.comment && (
              <p className="mt-2 text-sm italic text-muted/90">&ldquo;{submitted.comment}&rdquo;</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  async function handleSubmit() {
    if (stars < 1) {
      toast.error('Please select a star rating');
      return;
    }
    if (selectedIds.length === 0) {
      toast.error('Please choose at least one delivery experience');
      return;
    }
    if (otherSelected && !otherText.trim()) {
      toast.error('Please tell us more about the delivery');
      return;
    }

    setSubmitting(true);
    try {
      const rating = await api.post<SubmittedRating>(
        `/orders/${encodeURIComponent(orderAccessId)}/rider-rating`,
        {
          stars,
          comment: buildComment(selectedIds, otherText),
        },
        true,
      );
      setSubmitted(rating);
      onSubmitted?.(rating);
      toast.success('Thank you for rating your rider!');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not submit rider rating';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card mb-5 p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <Bike size={18} />
        </div>
        <div>
          <h3 className="font-semibold text-white">
            How was your delivery{riderName ? ` with ${riderName}` : ''}?
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            How was the delivery? You can select more than one.
          </p>
        </div>
      </div>

      <StarRatingInput value={stars} onChange={setStars} disabled={submitting} className="mb-4" />

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Delivery experience
      </p>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Delivery experience">
        {RIDER_RATING_CRITERIA.map((criterion) => {
          const selected = selectedIds.includes(criterion.id);
          return (
            <button
              key={criterion.id}
              type="button"
              aria-pressed={selected}
              disabled={submitting}
              onClick={() => toggleCriterion(criterion.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? 'border-brand bg-brand text-white'
                  : 'border-navy-border bg-navy-light/50 text-muted hover:border-brand/50 hover:text-white'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {criterion.label}
            </button>
          );
        })}
      </div>

      {otherSelected && (
        <textarea
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          disabled={submitting}
          maxLength={500}
          rows={3}
          placeholder="Tell us about the delivery…"
          className="input mb-4 w-full resize-none text-sm"
          aria-label="Other delivery feedback"
        />
      )}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting || stars < 1 || selectedIds.length === 0}
        className="btn-primary w-full py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit rider rating'}
      </button>
    </div>
  );
}
