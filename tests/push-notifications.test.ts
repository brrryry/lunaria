import { describe, it, expect, vi } from 'vitest';

describe('Push Notifications Service', () => {
  interface MockPushSubscription {
    id: string;
    userId: string;
    platform: 'web';
    token: string;
    endpoint?: string | null;
    p256dh?: string | null;
    auth?: string | null;
    createdAt: Date;
  }

  interface PushPayload {
    title: string;
    body: string;
    url?: string;
    data?: Record<string, any>;
  }

  // Helper simulating subscription validation
  function validateSubscription(sub: {
    platform: string;
    token: string;
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  }) {
    if (!sub.platform || !sub.token) {
      throw new Error('Missing platform or token');
    }
    if (sub.platform !== 'web') {
      throw new Error('Unsupported push subscription platform');
    }
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      throw new Error('Web Push subscriptions must have endpoint and p256dh/auth keys');
    }
    return true;
  }

  // Helper simulating dispatch to web push subscriptions
  async function dispatchPushToSubscriptions(
    subs: MockPushSubscription[],
    payload: PushPayload,
    sendWebPushMock: (sub: MockPushSubscription, payloadStr: string) => Promise<{ status: number }>,
    deleteSubMock: (id: string) => Promise<void>,
  ) {
    const webSubs = subs.filter((s) => s.platform === 'web' && s.endpoint && s.p256dh && s.auth);

    // Web push
    for (const sub of webSubs) {
      const payloadStr = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: '/icons/icon-192x192.png',
        url: payload.url || '/dashboard',
        data: payload.data,
      });

      try {
        const res = await sendWebPushMock(sub, payloadStr);
        if (res.status === 410 || res.status === 404) {
          await deleteSubMock(sub.id);
        }
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await deleteSubMock(sub.id);
        }
      }
    }
  }

  it('validates web push subscription schema correctly', () => {
    expect(() =>
      validateSubscription({
        platform: 'web',
        token: 'https://updates.push.services.mozilla.com/wpush/v2/xyz',
        endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/xyz',
        keys: {
          p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0A43cxIrUkjwm05dA8CdHB',
          auth: 'tBHItDaA95bbd6g',
        },
      }),
    ).not.toThrow();

    expect(() =>
      validateSubscription({
        platform: 'web',
        token: 'missing_keys',
      }),
    ).toThrow('Web Push subscriptions must have endpoint and p256dh/auth keys');
  });

  it('rejects missing platform or unsupported platforms', () => {
    expect(() =>
      validateSubscription({
        platform: '',
        token: 'https://updates.push.services.mozilla.com/wpush/v2/xyz',
      }),
    ).toThrow('Missing platform or token');

    expect(() =>
      validateSubscription({
        platform: 'unsupported',
        token: 'token-123',
      }),
    ).toThrow('Unsupported push subscription platform');
  });

  it('dispatches web push notifications to active browser endpoints', async () => {
    const sendWebPush = vi.fn().mockResolvedValue({ status: 201 });
    const deleteSub = vi.fn().mockResolvedValue(undefined);

    const subscriptions: MockPushSubscription[] = [
      {
        id: 'sub-1',
        userId: 'user-123',
        platform: 'web',
        token: 'https://fcm.googleapis.com/fcm/send/token1',
        endpoint: 'https://fcm.googleapis.com/fcm/send/token1',
        p256dh: 'dummy-p256dh',
        auth: 'dummy-auth',
        createdAt: new Date(),
      },
    ];

    await dispatchPushToSubscriptions(
      subscriptions,
      {
        title: 'Expense Alert',
        body: 'Large transaction of $1,200.00 at Apple Store',
        url: '/transactions',
      },
      sendWebPush,
      deleteSub,
    );

    expect(sendWebPush).toHaveBeenCalledTimes(1);
    expect(deleteSub).not.toHaveBeenCalled();

    const [calledSub, calledPayload] = sendWebPush.mock.calls[0];
    expect(calledSub.id).toBe('sub-1');
    const parsed = JSON.parse(calledPayload);
    expect(parsed.title).toBe('Expense Alert');
    expect(parsed.body).toBe('Large transaction of $1,200.00 at Apple Store');
    expect(parsed.url).toBe('/transactions');
  });

  it('prunes expired web push subscriptions when endpoint returns 410 Gone', async () => {
    const sendWebPush = vi.fn().mockResolvedValue({ status: 410 });
    const deleteSub = vi.fn().mockResolvedValue(undefined);

    const subscriptions: MockPushSubscription[] = [
      {
        id: 'sub-expired',
        userId: 'user-123',
        platform: 'web',
        token: 'https://fcm.googleapis.com/fcm/send/expired',
        endpoint: 'https://fcm.googleapis.com/fcm/send/expired',
        p256dh: 'dummy-p256dh',
        auth: 'dummy-auth',
        createdAt: new Date(),
      },
    ];

    await dispatchPushToSubscriptions(
      subscriptions,
      {
        title: 'Budget Alert',
        body: 'Over budget',
      },
      sendWebPush,
      deleteSub,
    );

    expect(sendWebPush).toHaveBeenCalledTimes(1);
    expect(deleteSub).toHaveBeenCalledWith('sub-expired');
  });

  it('dispatches web push notifications across multiple browser endpoints for the same user', async () => {
    const sendWebPush = vi.fn().mockResolvedValue({ status: 201 });
    const deleteSub = vi.fn().mockResolvedValue(undefined);

    const subscriptions: MockPushSubscription[] = [
      {
        id: 'sub-web-1',
        userId: 'user-123',
        platform: 'web',
        token: 'https://updates.push.services.mozilla.com/wpush/v2/user',
        endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/user',
        p256dh: 'key1',
        auth: 'auth1',
        createdAt: new Date(),
      },
      {
        id: 'sub-web-2',
        userId: 'user-123',
        platform: 'web',
        token: 'https://fcm.googleapis.com/fcm/send/user-chrome',
        endpoint: 'https://fcm.googleapis.com/fcm/send/user-chrome',
        p256dh: 'key2',
        auth: 'auth2',
        createdAt: new Date(),
      },
    ];

    await dispatchPushToSubscriptions(
      subscriptions,
      {
        title: 'Security Alert',
        body: 'Chase account needs reconnection',
        url: '/accounts',
      },
      sendWebPush,
      deleteSub,
    );

    expect(sendWebPush).toHaveBeenCalledTimes(2);
    expect(deleteSub).not.toHaveBeenCalled();
  });
});
