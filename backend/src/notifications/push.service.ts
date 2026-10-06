import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { eq, and } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../database/database.module.js';
import { LunariaDb, pushSubscriptions } from '@lunaria/db';

export interface PushSubscriptionDto {
  platform: 'web' | 'expo' | 'ios' | 'android';
  token: string;
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
  userAgent?: string;
}

export interface SendPushPayload {
  title: string;
  message: string;
  url?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private vapidPublicKey: string | null = null;
  private isVapidConfigured = false;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: LunariaDb,
    private readonly configService: ConfigService,
  ) {
    const vapidPublic = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const vapidPrivate = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const vapidSubject =
      this.configService.get<string>('VAPID_SUBJECT') ||
      'mailto:support@lunaria.money';

    if (vapidPublic && vapidPrivate) {
      try {
        webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
        this.vapidPublicKey = vapidPublic;
        this.isVapidConfigured = true;
        this.logger.log('Web Push (VAPID) service initialized successfully.');
      } catch (err) {
        this.logger.error('Failed to configure VAPID details for Web Push:', err);
      }
    } else {
      this.logger.warn('VAPID keys not provided. Web Push will run in mock mode.');
    }
  }

  getVapidPublicKey(): { publicKey: string | null } {
    return { publicKey: this.vapidPublicKey };
  }

  async registerSubscription(userId: string, dto: PushSubscriptionDto) {
    if (!dto.token && !dto.endpoint) {
      throw new Error('Push token or endpoint is required');
    }

    const token = dto.token || dto.endpoint!;
    const endpoint = dto.endpoint || (dto.platform === 'web' ? token : null);
    const p256dh = dto.keys?.p256dh || null;
    const auth = dto.keys?.auth || null;

    const [existing] = await this.db
      .select()
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.token, token),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(pushSubscriptions)
        .set({
          endpoint,
          p256dh,
          auth,
          userAgent: dto.userAgent || existing.userAgent,
          updatedAt: new Date(),
        })
        .where(eq(pushSubscriptions.id, existing.id))
        .returning();

      this.logger.log(`Updated push subscription for user ${userId} (${dto.platform})`);
      return updated;
    }

    const [created] = await this.db
      .insert(pushSubscriptions)
      .values({
        userId,
        platform: dto.platform,
        token,
        endpoint,
        p256dh,
        auth,
        userAgent: dto.userAgent || null,
      })
      .returning();

    this.logger.log(`Registered new push subscription for user ${userId} (${dto.platform})`);
    return created;
  }

  async unregisterSubscription(userId: string, token: string) {
    await this.db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.token, token),
        ),
      );

    this.logger.log(`Unregistered push subscription for user ${userId}`);
    return { success: true };
  }

  async getSubscriptionsForUser(userId: string) {
    return this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
  }

  async sendPushToUser(userId: string, payload: SendPushPayload) {
    const subscriptions = await this.getSubscriptionsForUser(userId);
    if (!subscriptions.length) {
      this.logger.debug(`No active push subscriptions found for user ${userId}`);
      return { sent: 0, failed: 0, total: 0 };
    }

    const webSubs = subscriptions.filter((s) => s.platform === 'web' && s.endpoint);
    const expoSubs = subscriptions.filter(
      (s) => s.platform === 'expo' || s.token.startsWith('ExponentPushToken['),
    );

    let sent = 0;
    let failed = 0;

    // 1. Dispatch Web Push (Browser)
    if (webSubs.length > 0 && this.isVapidConfigured) {
      const pushContent = JSON.stringify({
        title: payload.title,
        body: payload.message,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        url: payload.url || '/',
        data: payload.metadata || {},
        tag: `lunaria-${Date.now()}`,
      });

      await Promise.all(
        webSubs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint!,
                keys: {
                  p256dh: sub.p256dh || '',
                  auth: sub.auth || '',
                },
              },
              pushContent,
            );
            sent++;
            this.logger.log(`[Web Push Sent] To user ${userId} via ${(sub.endpoint || '').slice(0, 40)}...`);
          } catch (err: any) {
            failed++;
            this.logger.warn(`Web Push failed for subscription ${sub.id}: ${err.message}`);
            // If subscription expired or unsubscribed, prune from database
            if (err.statusCode === 410 || err.statusCode === 404) {
              await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
              this.logger.log(`Pruned expired Web Push subscription ${sub.id}`);
            }
          }
        }),
      );
    }

    // 2. Dispatch Expo Mobile Push (iOS / Android)
    if (expoSubs.length > 0) {
      const expoMessages = expoSubs.map((sub) => ({
        to: sub.token,
        sound: 'default',
        title: payload.title,
        body: payload.message,
        data: {
          url: payload.url || '/',
          ...(payload.metadata || {}),
        },
      }));

      try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(expoMessages),
        });

        if (response.ok) {
          const resData: any = await response.json();
          sent += expoSubs.length;
          this.logger.log(`[Expo Mobile Push Sent] Dispatched ${expoSubs.length} messages: ${JSON.stringify(resData?.data || {})}`);
        } else {
          failed += expoSubs.length;
          this.logger.error(`Expo Push API error: ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        failed += expoSubs.length;
        this.logger.error('Failed to send Expo mobile push:', err);
      }
    }

    return { sent, failed, total: subscriptions.length };
  }
}
