'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import {
  PROMOTION_CRITERIA_GROUPS,
  PROMOTION_OWNERSHIP_OPTIONS,
  PROMOTION_CONTRIBUTION_SOURCE_OPTIONS,
  criteriaGroupIdForKey,
  criteriaKey,
  criteriaLabel,
  customCriteriaKey,
  isCustomCriteriaKey,
  type PromotionOwnership,
  type ContributionSource,
  contributionSourceLabel,
} from '@/lib/promotionCriteria';

interface PromotionCriteriaSelectorProps {
  selected: string[];
  primaryCriteriaKey?: string;
  ownership: PromotionOwnership | '';
  branchScope?: 'all' | 'selected';
  contributionSource: ContributionSource;
  branchSharePct: number | '';
  platformSharePct: number | '';
  /** When set, ownership is fixed (branch admins create BRANCH offers only). */
  lockOwnership?: PromotionOwnership;
  onCriteriaChange: (next: string[]) => void;
  onOwnershipChange: (next: PromotionOwnership) => void;
  onContributionSourceChange: (next: ContributionSource) => void;
  onShareChange: (branch: number | '', platform: number | '') => void;
  /** Rendered between ownership and targeting tags (e.g. branch availability). */
  children?: ReactNode;
}

export default function PromotionCriteriaSelector({
  selected,
  primaryCriteriaKey,
  ownership,
  branchScope = 'all',
  contributionSource,
  branchSharePct,
  platformSharePct,
  lockOwnership,
  onCriteriaChange,
  onOwnershipChange,
  onContributionSourceChange,
  onShareChange,
  children,
}: PromotionCriteriaSelectorProps) {
  const [customInput, setCustomInput] = useState('');

  const sortedGroups = useMemo(() => {
    if (!primaryCriteriaKey) return PROMOTION_CRITERIA_GROUPS;
    const primaryGroupId = criteriaGroupIdForKey(primaryCriteriaKey);
    return [...PROMOTION_CRITERIA_GROUPS].sort((a, b) => {
      if (a.id === primaryGroupId) return -1;
      if (b.id === primaryGroupId) return 1;
      return 0;
    });
  }, [primaryCriteriaKey]);

  function toggle(key: string) {
    if (key === primaryCriteriaKey) return;
    onCriteriaChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  }

  function removeTag(key: string) {
    if (key === primaryCriteriaKey) return;
    onCriteriaChange(selected.filter((k) => k !== key));
  }

  function addCustomTag() {
    const label = customInput.trim();
    if (label.length < 2) return;
    const key = customCriteriaKey(label);
    if (selected.includes(key)) {
      setCustomInput('');
      return;
    }
    onCriteriaChange([...selected, key]);
    setCustomInput('');
  }

  function handleOwnership(next: PromotionOwnership) {
    onOwnershipChange(next);
    if (next === 'SHARED' && branchSharePct === '' && platformSharePct === '') {
      onShareChange(50, 50);
    }
    if (next === 'BRANCH') onShareChange(100, 0);
    if (next === 'PLATFORM') onShareChange(0, 100);
  }

  function handleBranchPct(raw: string) {
    const branch = raw === '' ? '' : Math.min(100, Math.max(0, Number(raw)));
    const platform = branch === '' ? '' : 100 - branch;
    onShareChange(branch, platform);
  }

  function handlePlatformPct(raw: string) {
    const platform = raw === '' ? '' : Math.min(100, Math.max(0, Number(raw)));
    const branch = platform === '' ? '' : 100 - platform;
    onShareChange(branch, platform);
  }

  const shareTotal =
    typeof branchSharePct === 'number' && typeof platformSharePct === 'number'
      ? branchSharePct + platformSharePct
      : null;

  const secondPartyLabel = contributionSourceLabel(contributionSource);

  return (
    <div className="promo-criteria promo-criteria--compact">
      <section className="promo-criteria__section">
        <h3 className="promo-criteria__heading">Promotion Ownership</h3>
        <div className="promo-criteria__ownership-grid">
          {(lockOwnership
            ? PROMOTION_OWNERSHIP_OPTIONS.filter((opt) => opt.value === lockOwnership)
            : PROMOTION_OWNERSHIP_OPTIONS
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`promo-criteria__ownership${ownership === opt.value ? ' promo-criteria__ownership--active' : ''}`}
              onClick={() => !lockOwnership && handleOwnership(opt.value)}
              disabled={Boolean(lockOwnership)}
            >
              <span className="promo-criteria__ownership-label">{opt.label}</span>
              <span className="promo-criteria__ownership-desc">
                {lockOwnership
                  ? 'Branch promotions — discount cost is covered by your branch'
                  : opt.description}
              </span>
            </button>
          ))}
        </div>

        {ownership === 'SHARED' && !lockOwnership && (
          <div className="promo-criteria__shared-split card p-3 mt-3 space-y-3">
            <div>
              <h4 className="promo-criteria__group-title">Contribution parties</h4>
              <div className="promo-criteria__ownership-grid">
                {PROMOTION_CONTRIBUTION_SOURCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`promo-criteria__ownership${contributionSource === opt.value ? ' promo-criteria__ownership--active' : ''}`}
                    onClick={() => onContributionSourceChange(opt.value)}
                  >
                    <span className="promo-criteria__ownership-label">{opt.label}</span>
                    <span className="promo-criteria__ownership-desc">{opt.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {branchScope !== 'selected' && (
              <>
                <h4 className="promo-criteria__group-title">Cost sharing split</h4>
                <div className="promo-criteria__shared-grid">
                  <label className="promo-create-panel__field">
                    Branch share %
                    <input
                      className="input-field"
                      type="number"
                      min={0}
                      max={100}
                      value={branchSharePct}
                      onChange={(e) => handleBranchPct(e.target.value)}
                      required
                    />
                  </label>
                  <label className="promo-create-panel__field">
                    {secondPartyLabel} share %
                    <input
                      className="input-field"
                      type="number"
                      min={0}
                      max={100}
                      value={platformSharePct}
                      onChange={(e) => handlePlatformPct(e.target.value)}
                      required
                    />
                  </label>
                </div>
                {shareTotal != null && shareTotal !== 100 && (
                  <p className="promo-criteria__shared-warning">
                    Percentages must total 100% (currently {shareTotal}%)
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {children}

      <section className="promo-criteria__section">
        <div className="promo-criteria__section-head">
          <h3 className="promo-criteria__heading">Targeting Tags</h3>
        </div>

        {selected.length > 0 && (
          <div className="promo-criteria__selected">
            {selected.map((key) => {
              const isPrimary = key === primaryCriteriaKey;
              const isCustom = isCustomCriteriaKey(key);
              return (
                <span
                  key={key}
                  className={`promo-criteria__selected-chip${isPrimary ? ' promo-criteria__selected-chip--primary' : ''}${isCustom ? ' promo-criteria__selected-chip--custom' : ''}`}
                >
                  {criteriaLabel(key)}
                  {isPrimary && <span className="promo-criteria__selected-from">Offer type</span>}
                  {!isPrimary && (
                    <button
                      type="button"
                      className="promo-criteria__selected-remove"
                      onClick={() => removeTag(key)}
                      aria-label={`Remove ${criteriaLabel(key)}`}
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}

        <div className="promo-criteria__custom-add">
          <input
            className="input-field promo-criteria__custom-input"
            placeholder="Custom tag (e.g. Milk Tea Lovers)"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomTag();
              }
            }}
          />
          <button type="button" className="promo-criteria__custom-btn" onClick={addCustomTag}>
            <Plus size={14} aria-hidden />
            Add
          </button>
        </div>

        <div className="promo-criteria__groups">
          {sortedGroups.map((group) => {
            const isPrimaryGroup = primaryCriteriaKey?.startsWith(`${group.id}::`);
            return (
              <div
                key={group.id}
                className={`promo-criteria__group card p-3${isPrimaryGroup ? ' promo-criteria__group--primary' : ''}`}
              >
                <h4 className="promo-criteria__group-title">
                  {group.label}
                  {isPrimaryGroup && <span className="promo-criteria__group-badge">From offer</span>}
                </h4>
                <div className="promo-criteria__chips">
                  {group.items.map((item) => {
                    const key = criteriaKey(group.id, item);
                    const active = selected.includes(key);
                    const isPrimary = key === primaryCriteriaKey;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`promo-criteria__chip${active ? ' promo-criteria__chip--active' : ''}${isPrimary ? ' promo-criteria__chip--locked' : ''}`}
                        onClick={() => toggle(key)}
                        disabled={isPrimary}
                        title={isPrimary ? 'Set from offer type in step 1' : undefined}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
