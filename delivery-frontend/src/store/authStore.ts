import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';
import { clearToken, setToken, setUser, setRefreshToken } from '@/lib/api';
import { handleCartOnLogin, handleCartOnLogout, type CartLoginOptions } from '@/lib/cartAuthSync';
import { clearUserSessionData } from '@/lib/userSession';
import { disconnectSocket, resetSocket } from '@/lib/socketClient';

export interface LoginOptions extends CartLoginOptions {
  refreshToken?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User, options?: LoginOptions) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  setSessionToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (token, user, options) => {
        setToken(token);
        setUser(user);
        if (options?.refreshToken) setRefreshToken(options.refreshToken);
        set({ user, token, isAuthenticated: true });
        resetSocket();
        void handleCartOnLogin(user.id, options);
      },
      logout: () => {
        handleCartOnLogout();
        clearToken();
        disconnectSocket();
        set({ user: null, token: null, isAuthenticated: false });
        clearUserSessionData();
      },
      setSessionToken: (token) => {
        setToken(token);
        set({ token, isAuthenticated: true });
      },
      updateUser: (updated) =>
        set((state) => {
          if (!state.user) return state;
          const user = { ...state.user, ...updated };
          const unchanged = (Object.keys(updated) as (keyof User)[]).every(
            (key) => state.user?.[key] === user[key],
          );
          if (unchanged) return state;
          setUser(user);
          return { user };
        }),
    }),
    {
      name: 'bc-auth',
      onRehydrateStorage: () => (state) => {
        if (!state?.token || !state.user) return;
        setToken(state.token);
        setUser(state.user);
      },
    }
  )
);
