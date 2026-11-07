import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';
import { clearToken, saveCustomerAuth, setUser } from '@/lib/customerSession';
import { handleCartOnLogin, handleCartOnLogout, type CartLoginOptions } from '@/lib/cartAuthSync';
import { clearUserSessionData } from '@/lib/userSession';
import { disconnectSocket, resetSocket } from '@/lib/socketClient';

export interface LoginOptions extends CartLoginOptions {
  accessExpiresAt?: number | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User, options?: LoginOptions) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (user, options) => {
        saveCustomerAuth(user, options?.accessExpiresAt);
        set({ user, isAuthenticated: true });
        resetSocket();
        void handleCartOnLogin(user.id, options);
      },
      logout: () => {
        handleCartOnLogout();
        clearToken();
        disconnectSocket();
        set({ user: null, isAuthenticated: false });
        clearUserSessionData();
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
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        if (!state?.user) return;
        setUser(state.user);
      },
    },
  ),
);
