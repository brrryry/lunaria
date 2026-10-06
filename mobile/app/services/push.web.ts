/**
 * Web stub for push notifications when running Expo Web.
 * Browser push notifications on the desktop website use the Web Push API (RFC 8291 / VAPID).
 * Mobile Expo Push notifications are intended for physical iOS and Android devices.
 */
export async function registerForPushNotificationsAsync(
  userId: string,
  apiBase: string = 'http://localhost:3001/api',
): Promise<string | null> {
  console.log('[Expo Web] Mobile Expo Push is for physical iOS and Android devices.');
  return null;
}
