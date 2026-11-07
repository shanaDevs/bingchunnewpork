'use client';

import { useState } from 'react';
import { CheckCircle2, MessageSquareHeart } from 'lucide-react';
import toast from 'react-hot-toast';

import StarRatingInput, { StarRatingDisplay } from '@/components/ui/StarRatingInput';
import { api, ApiError } from '@/lib/api';

type SubmittedRating = {
  stars: number;
  comment: string | null;
  createdAt: string;
};

type Props = {
  orderAccessId: string;
  existingRating?: SubmittedRating | null;
  onSubmitted?: (rating: SubmittedRating) => void;
};

export default function PlatformRatingCard({
  orderAccessId,
  existingRating = null,
  onSubmitted,
}: Props) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmittedRating | null>(existingRating);

  if (submitted) {
    return (
      <div className="card mb-5 border border-green-500/20 bg-green-500/5 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-400" />
          <div>
            <p className="font-semibold text-white">Thanks for your feedback!</p>
            <StarRatingDisplay value={submitted.stars} size={22} className="mt-2 justify-start" />
            <p className="mt-1 text-sm text-muted">
              You rated your experience {submitted.stars} out of 5 stars.
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

    setSubmitting(true);
    try {
      const rating = await api.post<SubmittedRating>(
        `/orders/${encodeURIComponent(orderAccessId)}/rating`,
        {
          stars,
          comment: comment.trim() || undefined,
        },
        true,
      );
      setSubmitted(rating);
      onSubmitted?.(rating);
      toast.success('Thank you for rating us!');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not submit rating';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card mb-5 p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <MessageSquareHeart size={18} />
        </div>
        <div>
          <h3 className="font-semibold text-white">How was your Bing Chun experience?</h3>
          <p className="mt-0.5 text-sm text-muted">
            Your rating helps us improve the platform for everyone.
          </p>
        </div>
      </div>

      <StarRatingInput value={stars} onChange={setStars} disabled={submitting} className="mb-4" />

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        disabled={submitting}
        maxLength={500}
        rows={3}
        placeholder="Tell us more (optional)"
        className="input mb-4 w-full resize-none text-sm"
      />

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting || stars < 1}
        className="btn-primary w-full py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit Rating'}
      </button>
    </div>
  );
}
