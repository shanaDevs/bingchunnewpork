import { io, type Socket } from 'socket.io-client';
import { getSocketUrl } from '@/lib/apiBase';
import { ensureAdminAccessToken } from '@/lib/adminSession';

let socket: Socket | null = null;

function readCustomerToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return localStorage.getItem('bc_token') || undefined;
  } catch {
    return undefined;
  }
}

export function getSocket(): Socket {
  if (!socket) {
    const token = readCustomerToken();
    socket = io(getSocketUrl(), {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      auth: token ? { token } : undefined,
    });
  }
  return socket;
}

/** Recreate the socket after login/logout so handshake auth stays in sync. */
export function resetSocket() {
  disconnectSocket();
  return getSocket();
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/** Refresh httpOnly admin cookies before Socket.io reconnect handshakes. */
export async function ensureAdminSocketAuth(): Promise<void> {
  await ensureAdminAccessToken();
}
