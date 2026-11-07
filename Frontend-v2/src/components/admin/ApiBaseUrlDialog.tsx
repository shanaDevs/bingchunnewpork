'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  clearApiBaseOverride,
  getApiBaseOverride,
  getDefaultApiBaseForEditor,
  setApiBaseOverride,
} from '@/lib/apiBase';
import { resetSocket } from '@/lib/socketClient';

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Hidden developer dialog — opened after tapping the Staff Login padlock 5 times.
 */
export default function ApiBaseUrlDialog({ open, onClose }: Props) {
  const [url, setUrl] = useState(() => getDefaultApiBaseForEditor());
  const hasOverride = Boolean(getApiBaseOverride());

  if (!open) return null;

  function save() {
    const trimmed = url.trim().replace(/\/$/, '');
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error('Enter a full http(s) URL, e.g. http://192.168.1.38:4000/api');
      return;
    }
    setApiBaseOverride(trimmed);
    try {
      resetSocket();
    } catch {
      // socket may not be initialised yet
    }
    toast.success('API base URL saved');
    onClose();
  }

  function reset() {
    clearApiBaseOverride();
    setUrl(getDefaultApiBaseForEditor());
    try {
      resetSocket();
    } catch {
      // ignore
    }
    toast.success('Reset to build default');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-base-title"
      >
        <div>
          <h2 id="api-base-title" className="text-lg font-bold text-fg">
            API Base URL
          </h2>
          <p className="text-xs text-muted mt-1">
            Tap the padlock ×5 to open. Saved in this browser only — no rebuild needed.
          </p>
          {hasOverride && (
            <p className="text-xs text-amber-400 mt-2">Custom API URL is active</p>
          )}
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">Core API (…/api)</span>
          <input
            className="input-field font-mono text-sm"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:4000/api"
            autoFocus
          />
        </label>

        <div className="flex flex-wrap gap-2 justify-end pt-1">
          <button type="button" className="btn-outline px-3 py-2 text-sm" onClick={reset}>
            Reset
          </button>
          <button type="button" className="btn-outline px-3 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
