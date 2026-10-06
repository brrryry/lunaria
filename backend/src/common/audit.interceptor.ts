import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LunariaDb } from '@lunaria/db';
import { auditLogs } from '@lunaria/db';
import { DATABASE_TOKEN } from '../database/database.module.js';
import jwt from 'jsonwebtoken';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    @Inject(DATABASE_TOKEN)
    private readonly db: LunariaDb,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const action = `${req.method} ${req.route?.path || req.url}`;

    // SEC-08: Resolve actor from JWT, not from the client-supplied x-user-id header
    // (which could be set to any value by an attacker). Use jwt.decode() (not verify)
    // since the token has already been verified upstream by AuthService.
    let actorId: string | null = null;
    const authHeader = req.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.decode(token) as { sub?: string } | null;
        actorId = decoded?.sub ?? null;
      } catch {
        // ignore — actor remains null
      }
    }

    const ipAddress = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] || null;

    return next.handle().pipe(
      tap(async () => {
        // Asynchronously record audit log row for sensitive API routes
        if (
          req.url.includes('/transactions') ||
          req.url.includes('/plaid') ||
          req.url.includes('/accounts')
        ) {
          try {
            await this.db.insert(auditLogs).values({
              actorId: actorId ? String(actorId) : null,
              action,
              ipAddress: ipAddress ? String(ipAddress) : null,
              userAgent: userAgent ? String(userAgent) : null,
              metadata: {
                query: req.query,
                params: req.params,
              },
            });
          } catch (err) {
            // Silently handle or log to stderr to not interrupt user flow
            console.error('Failed to write audit log:', err);
          }
        }
      }),
    );
  }
}
