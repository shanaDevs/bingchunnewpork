import { io, type Socket } from 'socket.io-client';
import { getSocketUrl } from '@/lib/apiBase';
import { ensureAdminAccessToken } from '@/lib/adminSession';

let socket: Socket | null = null;
let socketUrl: string | null = null;

function buildSocket(url: string): Socket {
  return io(url, {
    path: '/socket.io',
    // Polling first avoids the "closed before established" race when a proxy
    // briefly rejects the WebSocket upgrade; Socket.IO then upgrades to WS.
    transports: ['polling', 'websocket'],
    upgrade: true,
    withCredentials: true,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });
}

export function getSocket(): Socket {
  const url = getSocketUrl();
  if (socket && socketUrl === url) {
    if (socket.disconnected) socket.connect();
    return socket;
  }
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  socketUrl = url;
  socket = buildSocket(url);
  return socket;
}

/** Recreate the socket after login/logout so handshake auth stays in sync. */
export function resetSocket() {
  disconnectSocket();
  return getSocket();
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    socketUrl = null;
  }
}

/** Refresh httpOnly admin cookies before Socket.io reconnect handshakes. */
export async function ensureAdminSocketAuth(): Promise<void> {
  await ensureAdminAccessToken();
}
