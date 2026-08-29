import { create } from 'zustand';
import { api } from '../api/client';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  orgId: string;
  orgName: string;
}

interface SetupPayload {
  orgName: string;
  fullName: string;
  email: string;
  password: string;
}

interface AuthState {
  user: User | null;
  token: string;
  needsSetup: boolean;
  checkSetup: () => Promise<boolean>;
  setup: (data: SetupPayload) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  fetchProfile: () => Promise<void>;
  logout: () => void;
  init: () => Promise<void>;
}

// NOTE: plain selector functions instead of state getters — Zustand v5's
// set() copies enumerable props via Object.assign, which invokes getters and
// freezes their values, so a getter like isAuthenticated stays false forever.
export const selectIsAuthenticated = (s: AuthState) => Boolean(s.token && s.user);
export const selectIsOwner = (s: AuthState) => s.user?.role === 'owner';
export const selectIsAdmin = (s: AuthState) => ['owner', 'admin'].includes(s.user?.role ?? '');

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  token: localStorage.getItem('token') || '',
  needsSetup: false,

  async checkSetup() {
    const res = await api.get('/setup/status');
    const needsSetup: boolean = res.data.needsSetup;
    set({ needsSetup });
    return needsSetup;
  },

  async setup(data) {
    const res = await api.post('/setup', data);
    const token: string = res.data.token;
    const user: User = res.data.user;
    localStorage.setItem('token', token);
    set({ token, user });
  },

  async login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    const token: string = res.data.token;
    localStorage.setItem('token', token);
    set({ token });
    // Login response is partial — fetch full profile immediately.
    await get().fetchProfile();
  },

  async fetchProfile() {
    try {
      const res = await api.get('/profile');
      const d = res.data;
      // Map API response to User interface (org.name → orgName).
      set({
        user: {
          id: d.id,
          email: d.email,
          fullName: d.fullName || d.full_name || '',
          role: d.role,
          orgId: d.orgId || d.org_id || '',
          orgName: d.org?.name || d.orgName || '',
        },
      });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      // Only logout on 401 (invalid token) — not on network errors.
      if (status === 401) {
        get().logout();
      }
    }
  },

  logout() {
    localStorage.removeItem('token');
    set({ token: '', user: null });
  },

  async init() {
    if (get().token) {
      await get().fetchProfile();
    }
  },
}));
