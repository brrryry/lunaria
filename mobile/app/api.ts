import { Platform } from 'react-native';
import Constants from 'expo-constants';

declare const process: any;

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  token?: string;
}

export const DEMO_USER: SessionUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'demo@lunaria.finance',
  fullName: 'Demo User',
  avatarUrl: null,
};

let currentSession: SessionUser | null = null;

export function getSessionUser(): SessionUser | null {
  if (typeof window !== 'undefined' && (window as any).localStorage) {
    try {
      const stored = (window as any).localStorage.getItem('lunaria_mobile_user');
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
  }
  return currentSession;
}

export function setSessionUser(user: SessionUser | null) {
  currentSession = user;
  if (typeof window !== 'undefined' && (window as any).localStorage) {
    try {
      if (user) {
        (window as any).localStorage.setItem('lunaria_mobile_user', JSON.stringify(user));
      } else {
        (window as any).localStorage.removeItem('lunaria_mobile_user');
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Resolves the backend API base URL for Web, iOS Simulator, Android Emulator,
 * or a physical phone running Expo Go over local Wi-Fi.
 */
export function getApiBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Running in web browser
  if (Platform.OS === 'web') {
    return 'http://localhost:3001/api';
  }

  // If running in Expo Go on a real phone, use the packager host IP
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:3001/api`;
  }

  // Default to emulator/simulator hosts
  return Platform.select({
    android: 'http://10.0.2.2:3001/api',
    default: 'http://localhost:3001/api',
  });
}

let tokenFetchPromise: Promise<string | null> | null = null;

async function ensureToken(user: SessionUser): Promise<string | null> {
  if (user.token) return user.token;
  if (!tokenFetchPromise) {
    tokenFetchPromise = (async () => {
      try {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/auth/demo-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email || 'demo@lunaria.finance' }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.token) {
            setSessionUser({ ...user, token: data.token });
            return data.token;
          }
        }
      } catch (err) {
        console.warn('Auto-token resolution failed:', err);
      } finally {
        tokenFetchPromise = null;
      }
      return null;
    })();
  }
  return tokenFetchPromise;
}

/**
 * Robust fetch wrapper that attaches the authenticated session token and identity headers
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const url = path.startsWith('http') ? path : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  let user = getSessionUser();

  let token = user?.token;
  if (user && !token) {
    token = (await ensureToken(user)) || undefined;
    user = getSessionUser();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(user?.id ? { 'x-user-id': user.id } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}
