import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'lunaria-test-secret-key-12345';

interface TestUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  googleId?: string | null;
  authProvider: string;
}

export function createJwtToken(user: TestUser, secret: string = TEST_SECRET) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.fullName,
      avatarUrl: user.avatarUrl,
    },
    secret,
    { expiresIn: '30d' },
  );
}

export function verifyJwtToken(token: string, secret: string = TEST_SECRET) {
  try {
    return jwt.verify(token, secret) as {
      sub: string;
      email: string;
      name: string;
      avatarUrl?: string | null;
    };
  } catch {
    return null;
  }
}

export function resolveUserIdFromHeader(authHeader?: string, defaultUserId?: string) {
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const payload = verifyJwtToken(token);
    if (payload?.sub) {
      return payload.sub;
    }
  }
  return defaultUserId || null;
}

export function isEmailWhitelisted(
  email: string,
  rawWhitelist: string = '',
  isProduction: boolean = false,
): boolean {
  const whitelist = rawWhitelist
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (whitelist.length === 0) {
    return !isProduction; // In production, an empty whitelist denies access
  }

  return whitelist.includes(email.trim().toLowerCase());
}

describe('Authentication & JWT Session Engine', () => {
  const mockUser: TestUser = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    email: 'user@lunaria.finance',
    fullName: 'Jordan Bell',
    avatarUrl: 'https://lh3.googleusercontent.com/a/photo.jpg',
    googleId: '109823487123984',
    authProvider: 'google',
  };

  it('creates a valid JWT containing user identity claims', () => {
    const token = createJwtToken(mockUser);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const payload = verifyJwtToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe(mockUser.id);
    expect(payload?.email).toBe(mockUser.email);
    expect(payload?.name).toBe(mockUser.fullName);
    expect(payload?.avatarUrl).toBe(mockUser.avatarUrl);
  });

  it('rejects tampered or corrupted JWT tokens', () => {
    const token = createJwtToken(mockUser);
    const tamperedToken = token.slice(0, -5) + 'abcde';

    const payload = verifyJwtToken(tamperedToken);
    expect(payload).toBeNull();
  });

  it('rejects tokens signed with a different secret key', () => {
    const foreignToken = createJwtToken(mockUser, 'wrong-secret-key');
    const payload = verifyJwtToken(foreignToken, TEST_SECRET);
    expect(payload).toBeNull();
  });

  it('resolves user ID accurately from Authorization: Bearer header', () => {
    const token = createJwtToken(mockUser);
    const header = `Bearer ${token}`;

    const resolvedId = resolveUserIdFromHeader(header, 'fallback-id');
    expect(resolvedId).toBe(mockUser.id);
  });

  it('falls back to default user ID when no authorization header is supplied', () => {
    const resolvedId = resolveUserIdFromHeader(undefined, 'demo-user-id');
    expect(resolvedId).toBe('demo-user-id');
  });

  describe('Email Whitelist Security Gate', () => {
    const whitelist = 'admin@lunaria.finance, authorized@example.com, CEO@INVEST.COM';

    it('permits emails present in the whitelist (case-insensitive)', () => {
      expect(isEmailWhitelisted('admin@lunaria.finance', whitelist)).toBe(true);
      expect(isEmailWhitelisted('AUTHORIZED@example.com', whitelist)).toBe(true);
      expect(isEmailWhitelisted('ceo@invest.com', whitelist)).toBe(true);
    });

    it('blocks emails that are not in the whitelist', () => {
      expect(isEmailWhitelisted('stranger@gmail.com', whitelist)).toBe(false);
      expect(isEmailWhitelisted('attacker@hacker.io', whitelist)).toBe(false);
      expect(isEmailWhitelisted('fake-admin@lunaria.finance.co', whitelist)).toBe(false);
    });

    it('permits all emails if no whitelist is configured or empty in development mode', () => {
      expect(isEmailWhitelisted('anybody@gmail.com', '', false)).toBe(true);
      expect(isEmailWhitelisted('user@yahoo.com', '  ,  ', false)).toBe(true);
    });

    it('denies all emails if whitelist is empty in production mode', () => {
      expect(isEmailWhitelisted('anybody@gmail.com', '', true)).toBe(false);
      expect(isEmailWhitelisted('user@yahoo.com', '  ,  ', true)).toBe(false);
    });
  });
});
