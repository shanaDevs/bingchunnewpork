'use client';

import { adminApiFetch as adminFetch } from '@/lib/adminApi';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { MessageCircle, RefreshCw, Search, Send, User } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

type ConversationRow = {
  channel: string;
  externalUserId: string;
  phone: string | null;
  username: string | null;
  customerName: string | null;
  customerId: string | null;
  lastMessageAt: string | null;
  lastBody: string | null;
  lastDirection: string | null;
  messageCount: number;
  sessionState: string | null;
  storeId: string | null;
  storeName: string | null;
};

type ConversationDetail = {
  channel: string;
  externalUserId: string;
  phone: string | null;
  username: string | null;
  customer: { id: string; name: string | null; phone: string | null; email: string | null } | null;
  session: {
    state: string;
    storeId: string | null;
    storeName: string | null;
    storeCity: string | null;
    cartJson: unknown;
    updatedAt: string;
  } | null;
  messages: Array<{
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    senderType?: 'CUSTOMER' | 'BOT' | 'ADMIN' | 'SYSTEM';
    messageType: string;
    bodyText: string | null;
    createdAt: string;
    processed: boolean;
    orderId: string | null;
    orderNumber: string | null;
    orderStatus: string | null;
  }>;
};

function messageLabel(m: {
  direction: 'INBOUND' | 'OUTBOUND';
  senderType?: 'CUSTOMER' | 'BOT' | 'ADMIN' | 'SYSTEM';
  messageType: string;
}) {
  if (m.senderType === 'CUSTOMER' || m.direction === 'INBOUND') return 'Customer';
  if (m.senderType === 'ADMIN' || m.messageType === 'admin') return 'Admin';
  if (m.senderType === 'SYSTEM' || m.messageType === 'status') return 'Status';
  return 'Bot';
}

function formatPhone(phone: string | null | undefined, fallback: string) {
  if (!phone) return fallback;
  if (phone.startsWith('94') && phone.length >= 11) return `+${phone}`;
  if (phone.startsWith('+')) return phone;
  return phone;
}

export default function WhatsAppMessagesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const conversationsQuery = useQuery({
    queryKey: ['admin-whatsapp-conversations', search],
    queryFn: () =>
      adminFetch<ConversationRow[]>(
        `/admin/messaging/conversations?channel=WHATSAPP&limit=80${
          search ? `&q=${encodeURIComponent(search)}` : ''
        }`,
      ),
    refetchInterval: 15000,
  });

  const statusQuery = useQuery({
    queryKey: ['admin-whatsapp-status'],
    queryFn: () =>
      adminFetch<{
        token: { ok: boolean; status: string; detail: string; displayPhoneNumber?: string };
        webhookUrl: string;
        lastInbound: { at: string; from: string; preview: string; source: string } | null;
        metaSetup: { steps: string[]; callbackUrl: string };
      }>('/admin/messaging/whatsapp-status'),
    refetchInterval: 30000,
  });

  const conversations = conversationsQuery.data || [];

  useEffect(() => {
    if (!selectedUserId && conversations.length) {
      setSelectedUserId(conversations[0].externalUserId);
    }
  }, [conversations, selectedUserId]);

  const detailQuery = useQuery({
    queryKey: ['admin-whatsapp-thread', selectedUserId],
    queryFn: () =>
      adminFetch<ConversationDetail>(
        `/admin/messaging/conversations/${encodeURIComponent(selectedUserId!)}/messages?channel=WHATSAPP&limit=300`,
      ),
    enabled: Boolean(selectedUserId),
    refetchInterval: 10000,
  });

  const selected = useMemo(
    () => conversations.find((c) => c.externalUserId === selectedUserId) || null,
    [conversations, selectedUserId],
  );

  const detail = detailQuery.data;

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail?.messages.length, selectedUserId]);

  const replyMutation = useMutation({
    mutationFn: (text: string) =>
      adminFetch(`/admin/messaging/conversations/${encodeURIComponent(selectedUserId!)}/reply`, {
        method: 'POST',
        body: JSON.stringify({ text, channel: 'WHATSAPP' }),
      }),
    onSuccess: async () => {
      setReplyText('');
      toast.success('Reply sent');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-whatsapp-thread', selectedUserId] }),
        qc.invalidateQueries({ queryKey: ['admin-whatsapp-conversations'] }),
      ]);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to send reply'),
  });

  const sendReply = () => {
    const text = replyText.trim();
    if (!text || !selectedUserId || replyMutation.isPending) return;
    replyMutation.mutate(text);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-400" />
            WhatsApp Messages
          </h1>
          <p className="text-sm text-muted mt-1">
            Live inbox — automated bot messages plus manual admin replies.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            conversationsQuery.refetch();
            detailQuery.refetch();
            statusQuery.refetch();
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-navy-border bg-navy-card px-3 py-2 text-sm text-white hover:bg-navy-light"
        >
          <RefreshCw className={`h-4 w-4 ${conversationsQuery.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {statusQuery.data && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            statusQuery.data.token.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-50'
          }`}
        >
          <p className="font-semibold">
            Token: {statusQuery.data.token.status.toUpperCase()}
            {statusQuery.data.token.displayPhoneNumber
              ? ` · Business number ${statusQuery.data.token.displayPhoneNumber}`
              : ''}
          </p>
          <p className="mt-1 opacity-90">{statusQuery.data.token.detail}</p>
          {!statusQuery.data.token.ok && (
            <p className="mt-2 text-xs opacity-90">
              Fix: Meta Developer → WhatsApp → API Setup → copy a new Access Token → Admin → Settings →
              WhatsApp ordering → paste & save. Prefer a permanent System User token (temporary tokens
              expire in ~24 hours).
            </p>
          )}
          <p className="mt-2 text-xs opacity-80 break-all">
            Webhook: {statusQuery.data.webhookUrl}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] min-h-[70vh]">
        <div className="rounded-xl border border-navy-border bg-navy-card overflow-hidden flex flex-col">
          <div className="p-3 border-b border-navy-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                className="input-field pl-9 w-full"
                placeholder="Search phone or message…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[calc(70vh-56px)]">
            {conversationsQuery.isLoading && (
              <p className="p-4 text-sm text-muted">Loading conversations…</p>
            )}
            {conversationsQuery.isError && (
              <p className="p-4 text-sm text-red-400">
                {(conversationsQuery.error as Error).message || 'Failed to load'}
              </p>
            )}
            {!conversationsQuery.isLoading && conversations.length === 0 && (
              <p className="p-4 text-sm text-muted">No WhatsApp messages yet.</p>
            )}
            {conversations.map((c) => {
              const active = c.externalUserId === selectedUserId;
              return (
                <button
                  key={c.externalUserId}
                  type="button"
                  onClick={() => {
                    setSelectedUserId(c.externalUserId);
                    setReplyText('');
                  }}
                  className={`w-full text-left px-3 py-3 border-b border-navy-border/60 transition-colors ${
                    active ? 'bg-emerald-500/10' : 'hover:bg-navy-light/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {c.customerName || formatPhone(c.phone, c.externalUserId)}
                      </p>
                      <p className="text-[11px] text-muted truncate">
                        {formatPhone(c.phone, c.externalUserId)}
                        {c.storeName ? ` · ${c.storeName}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted whitespace-nowrap">
                      {c.lastMessageAt
                        ? format(new Date(c.lastMessageAt), 'dd MMM HH:mm')
                        : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted line-clamp-2">
                    {c.lastDirection === 'OUTBOUND' ? 'Out: ' : 'Customer: '}
                    {c.lastBody || '—'}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
                    <span>{c.messageCount} msgs</span>
                    {c.sessionState && (
                      <span className="rounded bg-navy-light px-1.5 py-0.5 text-emerald-300/90">
                        {c.sessionState}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-navy-border bg-navy-card overflow-hidden flex flex-col min-h-[70vh]">
          {!selectedUserId ? (
            <div className="flex-1 flex items-center justify-center text-muted text-sm p-8">
              Select a conversation
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-navy-border flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-white flex items-center gap-2">
                    <User className="h-4 w-4 text-emerald-400" />
                    {detail?.customer?.name ||
                      selected?.customerName ||
                      formatPhone(detail?.phone || selected?.phone, selectedUserId)}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {formatPhone(detail?.phone || selected?.phone, selectedUserId)}
                    {detail?.session?.storeName
                      ? ` · ${detail.session.storeName}${
                          detail.session.storeCity ? `, ${detail.session.storeCity}` : ''
                        }`
                      : ''}
                    {detail?.session?.state ? ` · ${detail.session.state}` : ''}
                  </p>
                </div>
                {detail?.customer?.id && (
                  <Link
                    href={`/admin/users?q=${encodeURIComponent(detail.customer.phone || '')}`}
                    className="text-xs text-brand hover:underline"
                  >
                    View customer
                  </Link>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[calc(70vh-180px)] bg-navy-light/20">
                {detailQuery.isLoading && (
                  <p className="text-sm text-muted">Loading messages…</p>
                )}
                {detailQuery.isError && (
                  <p className="text-sm text-red-400">
                    {(detailQuery.error as Error).message || 'Failed to load thread'}
                  </p>
                )}
                {(detail?.messages || []).map((m) => {
                  const inbound = m.direction === 'INBOUND';
                  const isAdmin = m.senderType === 'ADMIN' || m.messageType === 'admin';
                  const label = messageLabel(m);
                  return (
                    <div
                      key={m.id}
                      className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                          inbound
                            ? 'bg-navy-light text-white rounded-bl-md'
                            : isAdmin
                              ? 'bg-sky-600/30 text-sky-50 border border-sky-400/40 rounded-br-md'
                              : 'bg-emerald-600/25 text-emerald-50 border border-emerald-500/30 rounded-br-md'
                        }`}
                      >
                        <p className="text-[10px] uppercase tracking-wide opacity-70 mb-1">
                          {label}
                          {' · '}
                          {format(new Date(m.createdAt), 'dd MMM HH:mm:ss')}
                        </p>
                        <p>{m.bodyText || `(${m.messageType})`}</p>
                        {m.orderNumber && (
                          <Link
                            href={`/admin/orders?q=${encodeURIComponent(m.orderNumber)}`}
                            className="mt-1 inline-block text-[11px] text-brand hover:underline"
                          >
                            Order #{m.orderNumber}
                            {m.orderStatus ? ` · ${m.orderStatus}` : ''}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
                {detail && detail.messages.length === 0 && (
                  <p className="text-sm text-muted">No messages in this thread.</p>
                )}
                <div ref={threadEndRef} />
              </div>

              <div className="border-t border-navy-border p-3 bg-navy-card">
                <p className="text-[11px] text-muted mb-2">
                  Manual reply to this customer (separate from automated bot messages).
                </p>
                <div className="flex items-end gap-2">
                  <textarea
                    className="input-field min-h-[72px] max-h-40 flex-1 resize-y text-sm"
                    placeholder="Type a reply…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    disabled={replyMutation.isPending || !statusQuery.data?.token.ok}
                  />
                  <button
                    type="button"
                    onClick={sendReply}
                    disabled={
                      replyMutation.isPending ||
                      !replyText.trim() ||
                      !statusQuery.data?.token.ok
                    }
                    className="inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {replyMutation.isPending ? 'Sending…' : 'Send'}
                  </button>
                </div>
                {!statusQuery.data?.token.ok && (
                  <p className="mt-2 text-xs text-amber-300">
                    WhatsApp token is not OK — fix token in Settings before sending replies.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
