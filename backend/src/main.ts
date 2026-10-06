import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { AuditInterceptor } from './common/audit.interceptor.js';
import { DATABASE_TOKEN } from './database/database.module.js';

function validateProductionSecrets(configService: ConfigService, logger: Logger): void {
  if (process.env.NODE_ENV !== 'production') return;

  const errors: string[] = [];

  const jwtSecret = configService.get<string>('JWT_SECRET') || '';
  if (!jwtSecret || jwtSecret.includes('lunaria-super-secret')) {
    errors.push('JWT_SECRET must be set to a cryptographically random value in production');
  }

  const encKey = configService.get<string>('ENCRYPTION_KEY') || '';
  if (!encKey || encKey.startsWith('0123456789abcdef')) {
    errors.push('ENCRYPTION_KEY must be set to a cryptographically random value in production (all stored Plaid tokens depend on this)');
  }

  const dbUrl = configService.get<string>('DATABASE_URL') || '';
  if (!dbUrl || dbUrl.includes('postgres:postgres@')) {
    errors.push('DATABASE_URL must be set with non-default credentials in production');
  }

  const allowBypass = configService.get<string>('ALLOW_DEV_AUTH_BYPASS');
  if (allowBypass === 'true') {
    errors.push('ALLOW_DEV_AUTH_BYPASS must be set to false in production');
  }

  const whitelist = configService.get<string>('AUTH_WHITELIST_EMAILS') || '';
  if (!whitelist.trim()) {
    errors.push('AUTH_WHITELIST_EMAILS must be set to restrict access to authorized family/user emails in production');
  }

  if (errors.length > 0) {
    logger.error('=== FATAL: PRODUCTION SECRETS NOT CONFIGURED ===');
    for (const err of errors) {
      logger.error(`  - ${err}`);
    }
    logger.error('Generate secrets with: openssl rand -hex 32');
    process.exit(1);
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  // Trust first proxy hop (Nginx Proxy Manager / Docker bridge / Next.js)
  (app.getHttpAdapter().getInstance() as any).set('trust proxy', 1);

  // Fail hard if critical secrets are not configured in production
  validateProductionSecrets(configService, logger);

  const port = configService.get<number>('PORT') || 3001;
  const isProd = configService.get<string>('NODE_ENV') === 'production';

  // SEC-11: Security headers via helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: isProd
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  const configuredOrigins = (configService.get<string>('CORS_ORIGIN') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3003',
      'http://localhost:8081',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3003',
      ...configuredOrigins,
    ],
    credentials: true,
  });

  app.use(cookieParser());

  // SEC-06: Extract HttpOnly cookie authentication token and seamlessly bridge to Authorization header
  app.use((req: any, _res: any, next: any) => {
    const cookieToken = req.cookies?.['lunaria_token'];
    if (cookieToken && !req.headers['authorization']) {
      req.headers['authorization'] = `Bearer ${cookieToken}`;
    }
    next();
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global audit logging interceptor for sensitive queries
  const db = app.get(DATABASE_TOKEN);
  app.useGlobalInterceptors(new AuditInterceptor(db));

  await app.listen(port);
  logger.log(`Lunaria API Gateway listening on http://localhost:${port}/api`);
}

bootstrap();
