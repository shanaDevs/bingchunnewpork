'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PromotionRules, SelectedPromoProduct } from '@/lib/promotionTypes';
import { uploadPromoImage } from '@/lib/promoImageUpload';
import PromotionProductPicker from '@/components/admin/promotions/PromotionProductPicker';
import { PromotionBannerCardPreview } from '@/components/promotions/PromotionBannerCard';

function syncPrimaryProduct(rules: PromotionRules, products: SelectedPromoProduct[]): PromotionRules {
  const primary = products[0];
  return {
    ...rules,
    selectedProducts: products,
    productId: primary?.id,
    productName: primary?.name,
  };
}

interface PromotionBannerSetupProps {
  rules: PromotionRules;
  onChange: (rules: PromotionRules) => void;
  promoTitle?: string;
  promoCode?: string;
  className?: string;
}

export default function PromotionBannerSetup({
  rules,
  onChange,
  promoTitle = '',
  promoCode = 'PROMO',
  className = '',
}: PromotionBannerSetupProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const url = await uploadPromoImage(file);
      onChange({ ...rules, bannerImageUrl: url });
      toast.success('Banner uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={`promo-banner-setup card p-4 ${className}`.trim()}>
      <div className="promo-banner-setup__header">
        <h4 className="text-sm font-bold text-white">Upload Banner *</h4>
      </div>

      <div className="promo-banner-upload__grid mt-4">
        <div className="promo-banner-upload__fields">
          <button
            type="button"
            className={`promo-banner-upload__dropzone${rules.bannerImageUrl ? ' promo-banner-upload__dropzone--has-image' : ''}`}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {rules.bannerImageUrl ? (
              <div className="promo-banner-upload__preview-thumb promo-banner-upload__preview-thumb--large">
                <Image src={rules.bannerImageUrl} alt="" fill className="object-cover" unoptimized sizes="320px" />
              </div>
            ) : (
              <>
                <ImagePlus size={36} className="text-brand" />
                <span className="promo-banner-upload__dropzone-title">
                  {uploading ? 'Uploading…' : 'Click to upload banner image'}
                </span>
                <span className="promo-banner-upload__dropzone-hint">PNG, JPG · recommended 800×800px</span>
              </>
            )}
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = '';
            }}
          />

          {rules.bannerImageUrl && (
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                className="btn-outline px-3 py-2 text-sm inline-flex items-center gap-1.5"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Upload size={14} />
                Replace banner
              </button>
              <button
                type="button"
                className="btn-outline px-3 py-2 text-sm text-red-400"
                onClick={() => onChange({ ...rules, bannerImageUrl: undefined })}
              >
                Remove
              </button>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <label className="promo-create-panel__field">
              Display price (LKR)
              <input
                className="input-field"
                type="number"
                min={0}
                placeholder="3990"
                value={rules.displayPrice ?? ''}
                onChange={(e) => onChange({ ...rules, displayPrice: Number(e.target.value) })}
              />
            </label>
            <label className="promo-create-panel__field">
              Button label
              <input
                className="input-field"
                placeholder="Add to Bucket"
                value={rules.ctaLabel ?? ''}
                onChange={(e) => onChange({ ...rules, ctaLabel: e.target.value })}
              />
            </label>
          </div>

          <div className="mt-3">
            <PromotionProductPicker
              label="Linked product (optional)"
              selected={rules.selectedProducts ?? (rules.productId ? [{ id: rules.productId, name: rules.productName ?? '' }] : [])}
              onChange={(products) => onChange(syncPrimaryProduct(rules, products))}
              multiple={false}
            />
          </div>
        </div>

        <div className="promo-banner-upload__live">
          <p className="promo-banner-upload__label">Customer preview</p>
          <PromotionBannerCardPreview
            title={promoTitle || 'Promotion Title'}
            image={rules.bannerImageUrl}
            displayPrice={rules.displayPrice}
            ctaLabel={rules.ctaLabel}
            code={promoCode}
          />
        </div>
      </div>
    </div>
  );
}
