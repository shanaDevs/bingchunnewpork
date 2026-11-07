'use client';

import { io, type Socket, type ManagerOptions, type SocketOptions } from 'socket.io-client';
import { getApiBaseUrl, getSocketUrl } from '@/lib/apiBase';
import { ensureAdminAccessToken, withAdminCredentials } from '@/lib/adminSession';

type AdminSocketOpts = Partial<ManagerOptions & SocketOptions> & {
  /** When false, caller connects after attaching listeners. Default true. */
  autoConnect?: boolean;
};

/** Fetch JWT for Socket.IO handshake (httpOnly cookie is not visible to JS / cross-origin WS). */
export async function fetchAdminSocketToken(): Promise<string | null> {
  const ok = await ensureAdminAccessToken();
  if (!ok) return null;
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/auth/admin/socket-token`,
      withAdminCredentials({ method: 'GET', headers: { Accept: 'application/json' } }),
    );
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { token?: string };
    };
    const token = json.data?.token;
    return typeof token === 'string' && token ? token : null;
  } catch {
    return null;
  }
}

/** Build an admin Socket.IO client with handshake auth for CapRover cross-origin sockets. */
export async function createAdminSocket(opts: AdminSocketOpts = {}): Promise<Socket | null> {
  const token = await fetchAdminSocketToken();
  if (!token) return null;

  const { autoConnect = true, ...rest } = opts;
  const socket = io(getSocketUrl(), {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    withCredentials: true,
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
    auth: { token },
    ...rest,
  });

  socket.io.on('reconnect_attempt', () => {
    void fetchAdminSocketToken().then((next) => {
      if (next) socket.auth = { token: next };
    });
  });

  if (autoConnect) socket.connect();
  return socket;
}

/** Connect + join admin rooms once handshake auth is ready. */
export async function connectAdminSocketWithRooms(
  rooms: Array<{ adminId: string; storeId?: string | null }>,
  onSocket: (socket: Socket) => void,
): Promise<Socket | null> {
  const socket = await createAdminSocket({ autoConnect: false });
  if (!socket) return null;
  socket.on('connect', () => {
    for (const room of rooms) {
      if (!room.adminId) continue;
      socket.emit('joinAdmin', {
        adminId: room.adminId,
        storeId: room.storeId || undefined,
      });
    }
  });
  onSocket(socket);
  socket.connect();
  return socket;
}
