import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  private readonly frontendUrl: string;
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }

  /**
   * SEC-05: Validates that the state/redirect parameter is within our own frontend
   * origin. Rejects any attempt to redirect to an external URL, preventing open
   * redirect attacks that would deliver JWTs to attacker-controlled sites.
   */
  private sanitizeCallbackUrl(): string {
    // Always redirect to the canonical callback path — ignore any external state
    return `${this.frontendUrl}/auth/callback`;
  }

  @Get('google')
  googleAuth(
    @Res() res: Response,
    @Query('redirect_to') redirectTo?: string,
  ) {
    try {
      const url = this.authService.generateGoogleAuthUrl(redirectTo);
      return res.redirect(url);
    } catch (err: any) {
      return res.status(400).json({
        error: 'Google OAuth not configured',
        message: err.message,
      });
    }
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Query('state') _state: string, // state is intentionally not used for redirects (SEC-05)
    @Res() res: Response,
  ) {
    // SEC-05: Always redirect to our own frontend. Never follow an external `state` URL.
    const callbackUrl = this.sanitizeCallbackUrl();
    const separator = callbackUrl.includes('?') ? '&' : '?';

    if (error || !code) {
      // SEC-13: Use a safe, generic error code — do not forward raw error strings
      const safeError = error === 'access_denied' ? 'access_denied' : 'oauth_error';
      return res.redirect(`${callbackUrl}${separator}error=${safeError}`);
    }

    try {
      const profile = await this.authService.exchangeGoogleCode(code);

      // Verify email against whitelist
      if (!this.authService.isEmailWhitelisted(profile.email)) {
        return res.redirect(
          `${callbackUrl}${separator}error=unauthorized_email&email=${encodeURIComponent(
            profile.email,
          )}`,
        );
      }

      const user = await this.authService.upsertGoogleUser(profile);
      const token = this.authService.createJwtToken(user);

      // SEC-06: Set HttpOnly, Secure, SameSite=Lax cookie directly on server response.
      // Token is NEVER passed in URL query parameters.
      const isProd = process.env.NODE_ENV === 'production';
      res.cookie('lunaria_token', token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.redirect(callbackUrl);
    } catch (err: any) {
      // SEC-13: Log the real error internally, expose only a safe generic message
      this.logger.error(`Google OAuth callback error: ${err?.message}`, err?.stack);
      return res.redirect(`${callbackUrl}${separator}error=authentication_failed`);
    }
  }

  @Get('me')
  async getMe(@Headers('authorization') authHeader?: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7).trim();
    const payload = this.authService.verifyToken(token);
    const user = await this.authService.getUser(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    if (!this.authService.isEmailWhitelisted(user.email)) {
      throw new UnauthorizedException('UNAUTHORIZED_EMAIL');
    }

    // SEC-14: Return only the fields the frontend needs — exclude internal fields
    // (googleId, authProvider, raw timestamps, etc.)
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        currency: user.currency,
      },
      authenticated: true,
    };
  }

  @Get('session')
  async getSession(@Headers('authorization') authHeader?: string) {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7).trim();
        const payload = this.authService.verifyToken(token);
        const user = await this.authService.getUser(payload.sub);
        if (user && this.authService.isEmailWhitelisted(user.email)) {
          // SEC-14: Return only the fields the frontend needs
          return {
            user: {
              id: user.id,
              email: user.email,
              fullName: user.fullName,
              avatarUrl: user.avatarUrl,
              currency: user.currency,
            },
            authenticated: true,
          };
        }
      } catch {
        // Continue to unauthorized
      }
    }

    throw new UnauthorizedException('No active session found');
  }

  @Post('demo-login')
  async demoLogin(
    @Body() body: { email?: string } | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    // SEC-10: This endpoint must not exist in production — return 404 to prevent
    // any auth bypass, even if ALLOW_DEV_AUTH_BYPASS is accidentally set.
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    const session = await this.authService.generateDemoSession(body?.email);
    if (session?.token) {
      res.cookie('lunaria_token', session.token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    return session;
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('lunaria_token', { path: '/' });
    return { success: true };
  }

  @Get('user/:id')
  async getUser(
    @Param('id') id: string,
    @Headers('authorization') authHeader?: string,
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }
    const token = authHeader.substring(7).trim();
    const payload = this.authService.verifyToken(token);
    if (payload.sub !== id) {
      throw new UnauthorizedException('Forbidden: cannot access other user profiles');
    }
    const user = await this.authService.getUser(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      currency: user.currency,
    };
  }
}
