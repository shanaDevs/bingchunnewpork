'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { api } from '@/lib/api';

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api.post('/auth/password/reset', { token, password });
      setMessage('Password updated. You can sign in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 420, margin: '4rem auto', display: 'grid', gap: 12 }}>
      <h1>Reset password</h1>
      <input type="password" value={password} minLength={8} required onChange={(e) => setPassword(e.target.value)} placeholder="New password" />
      <button type="submit">Update password</button>
      {message && <p>{message}</p>}
      {error && <p>{error}</p>}
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
