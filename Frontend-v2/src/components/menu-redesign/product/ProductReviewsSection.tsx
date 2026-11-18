'use client';

import { useQuery } from '@tanstack/react-query';
import { PenLine, Star } from 'lucide-react';
import { useState } from 'react';
import { Container } from '@/components/home-redesign/ui/Container';
import { cn } from '@/components/home-redesign/lib/cn';
import { useAuthStore } from '@/store/authStore';
import StarRatingInput from '@/components/ui/StarRatingInput';
import { api } from '@/lib/api';
import type { Product } from '@/types';

type ProductReview = {
  id: string;
  rating: number;
  text: string;
  author: string;
  createdAt: string;
};

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn('size-4', i < rating ? 'fill-sun-400 text-sun-400' : 'fill-brand-100 text-brand-100')}
        />
      ))}
    </span>
  );
}

export function ProductReviewsSection({ product }: { product: Product }) {
  const [writing, setWriting] = useState(false);
  const { data: reviews = [], refetch } = useQuery<ProductReview[]>({
    queryKey: ['product-reviews', product.id, 'detail'],
    queryFn: () => api.get(`/menu/products/${product.id}/ratings?limit=20`),
  });

  const avg = product.avgRating ?? (reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : null);
  const count = product.ratingCount ?? reviews.length;

  return (
    <section aria-labelledby="reviews-heading" className="border-t border-brand-100 bg-brand-50/40 py-12 sm:py-16">
      <Container>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2
              id="reviews-heading"
              className="font-display text-[clamp(1.5rem,3vw,2.25rem)] font-semibold text-brand-950 uppercase [font-variation-settings:'wdth'_75,'opsz'_96]"
            >
              Customer reviews
            </h2>
            {avg != null && count > 0 && (
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                <StarDisplay rating={Math.round(avg)} />
                <span className="font-semibold text-brand-950">{avg.toFixed(1)}</span>
                <span>({count} reviews)</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-snow hover:bg-brand-700"
          >
            <PenLine className="size-4" />
            Write a review
          </button>
        </div>

        {writing && (
          <ReviewForm productId={product.id} onDone={() => { setWriting(false); refetch(); }} onCancel={() => setWriting(false)} />
        )}

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {reviews.slice(0, 8).map((review) => (
            <li key={review.id} className="rounded-2xl bg-white p-5 ring-1 ring-brand-100">
              <StarDisplay rating={review.rating} />
              <p className="mt-2 text-sm text-slate-700">{review.text}</p>
              <p className="mt-3 text-xs font-semibold text-slate-500">{review.author}</p>
            </li>
          ))}
          {reviews.length === 0 && (
            <li className="col-span-full text-center text-sm text-slate-500 py-8">No reviews yet — be the first!</li>
          )}
        </ul>
      </Container>
    </section>
  );
}

function ReviewForm({
  productId,
  onDone,
  onCancel,
}: {
  productId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [stars, setStars] = useState(5);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(
        `/menu/products/${productId}/rating`,
        {
          stars,
          comment: comment.trim(),
          name: name.trim(),
        },
        isAuthenticated,
      );
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-brand-100">
      <StarRatingInput value={stars} onChange={setStars} />
      <label className="mt-4 block text-sm font-semibold text-brand-950">
        Your name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-brand-100 px-3 py-2"
          required
        />
      </label>
      <label className="mt-3 block text-sm font-semibold text-brand-950">
        Review
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-brand-100 px-3 py-2"
          required
        />
      </label>
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm font-semibold text-brand-700 ring-1 ring-brand-200">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-snow">
          Submit
        </button>
      </div>
    </form>
  );
}
