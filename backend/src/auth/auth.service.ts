import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LunariaDb,
  users,
  UserRow,
} from '@lunaria/db';
import { eq, or } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { DATABASE_TOKEN } from '../database/database.module.js';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly googleClientId: string;
  private readonly googleClientSecret: string;
  private readonly googleCallbackUrl: string;

  constructor(
    @Inject(DATABASE_TOKEN)
    private readonly db: LunariaDb,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret =
      this.configService.get<string>('JWT_SECRET') ||
      'lunaria-super-secret-default-key-change-in-prod';
    this.googleClientId =
      this.configService.get<string>('GOOGLE_CLIENT_ID') || '';
    this.googleClientSecret =
      this.configService.get<string>('GOOGLE_CLIENT_SECRET') || '';
    this.googleCallbackUrl =
      this.configService.get<string>('GOOGLE_CALLBACK_URL') ||
      'http://localhost:3001/api/auth/google/callback';
  }

  createJwtToken(user: UserRow): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.fullName,
      avatarUrl: user.avatarUrl,
    };
    // SEC-07: Reduced from 30d to 7d to limit the damage window of a stolen token.
    return jwt.sign(payload, this.jwtSecret, { expiresIn: '7d' });
  }

  isEmailWhitelisted(email: string): boolean {
    const rawWhitelist =
      this.configService.get<string>('AUTH_WHITELIST_EMAILS') || '';

    const whitelist = rawWhitelist
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    // If whitelist is empty: in production, reject all logins to prevent open internet access.
    // In development mode, permit all authenticated Google users.
    if (whitelist.length === 0) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          'CRITICAL: AUTH_WHITELIST_EMAILS is empty in production. Denying all login attempts to prevent unauthorized public access.',
        );
        return false;
      }
      return true;
    }

    return whitelist.includes(email.trim().toLowerCase());
  }

  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }

  async generateDemoSession(email?: string) {
    if (
      process.env.NODE_ENV === 'production' ||
      this.configService.get<string>('ALLOW_DEV_AUTH_BYPASS') !== 'true'
    ) {
      throw new UnauthorizedException('Demo session is disabled in production');
    }

    // SEC-04: Removed hardcoded fallback email. An explicit email is required in dev mode.
    if (!email) {
      throw new UnauthorizedException(
        'An explicit email body parameter is required for dev session generation',
      );
    }

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const token = this.createJwtToken(user);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        token,
      },
    };
  }

  async upsertGoogleUser(profile: {
    googleId: string;
    email: string;
    name: string;
    avatarUrl?: string | null;
  }): Promise<UserRow> {
    const existing = await this.db
      .select()
      .from(users)
      .where(or(eq(users.googleId, profile.googleId), eq(users.email, profile.email)))
      .limit(1);

    if (existing.length > 0) {
      const user = existing[0];
      const [updated] = await this.db
        .update(users)
        .set({
          googleId: profile.googleId,
          fullName: profile.name || user.fullName,
          avatarUrl: profile.avatarUrl || user.avatarUrl,
          authProvider: 'google',
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(users)
      .values({
        email: profile.email,
        fullName: profile.name || 'Lunaria User',
        avatarUrl: profile.avatarUrl || null,
        googleId: profile.googleId,
        authProvider: 'google',
        currency: 'USD',
      })
      .returning();

    return created;
  }

  generateGoogleAuthUrl(state?: string): string {
    if (!this.googleClientId) {
      throw new Error(
        'GOOGLE_CLIENT_ID is not configured in .env. Please configure Google OAuth credentials.',
      );
    }

    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    const params = new URLSearchParams({
      client_id: this.googleClientId,
      redirect_uri: this.googleCallbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      ...(state ? { state } : {}),
    });

    return `${rootUrl}?${params.toString()}`;
  }

  async exchangeGoogleCode(code: string) {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const body = new URLSearchParams({
      code,
      client_id: this.googleClientId,
      client_secret: this.googleClientSecret,
      redirect_uri: this.googleCallbackUrl,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      this.logger.error(`Failed to exchange Google OAuth code: ${errorText}`);
      throw new UnauthorizedException('Failed to exchange Google OAuth authorization code');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Fetch Google User Profile
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      throw new UnauthorizedException('Failed to fetch user profile from Google');
    }

    const userInfo = await userInfoRes.json();
    return {
      googleId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name || userInfo.email,
      avatarUrl: userInfo.picture || null,
    };
  }

  async resolveUserId(providedUserId?: string, authHeader?: string): Promise<string> {
    // 1. Try JWT Authorization Bearer header
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      try {
        const payload = this.verifyToken(token);
        if (payload?.sub) {
          return payload.sub;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to verify Bearer token: ${err?.message || err}`);
      }
    }

    // 2. Strict Dev-Only bypass (ONLY when explicitly enabled in non-production environments)
    const allowDevBypass =
      process.env.NODE_ENV !== 'production' &&
      this.configService.get<string>('ALLOW_DEV_AUTH_BYPASS') === 'true';

    if (allowDevBypass) {
      const isUuid = Boolean(
        providedUserId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          providedUserId,
        ),
      );

      if (isUuid && providedUserId) {
        this.logger.warn(
          `[DEV ONLY] Authenticating via unverified UUID parameter: ${providedUserId}`,
        );
        return providedUserId;
      }

      try {
        const firstUser = await this.db
          .select({ id: users.id })
          .from(users)
          .limit(1);
        if (firstUser.length > 0) {
          this.logger.warn(
            `[DEV ONLY] Authenticating via database first-user fallback: ${firstUser[0].id}`,
          );
          return firstUser[0].id;
        }
      } catch (err) {
        this.logger.warn(`Could not resolve fallback user: ${err}`);
      }
    }

    throw new UnauthorizedException('User authentication required');
  }

  async getUser(id: string): Promise<UserRow | null> {
    const res = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return res[0] || null;
  }
}
