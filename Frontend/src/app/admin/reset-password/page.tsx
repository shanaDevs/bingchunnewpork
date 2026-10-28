'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

function AdminResetForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api.post('/auth/admin/password/reset', { token, password });
      setMessage('Password updated. Sign in again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 420, margin: '4rem auto', display: 'grid', gap: 12 }}>
      <h1>Reset admin password</h1>
      <input type="password" value={password} minLength={8} required onChange={(e) => setPassword(e.target.value)} placeholder="New password" />
      <button type="submit">Update password</button>
      {message && <p>{message}</p>}
      {error && <p>{error}</p>}
    </form>
  );
}

export default function AdminResetPasswordPage() {
  return (
    <Suspense>
      <AdminResetForm />
    </Suspense>
  );
}
