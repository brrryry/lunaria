'use client';

import { useState, useEffect, useCallback } from 'react';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useWebPush() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getHeaders = useCallback(() => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('lunaria_token')
        : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  // Check support and current subscription status on mount
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    ) {
      setIsSupported(true);
      setPermission(Notification.permission);

      // Register SW if not already registered
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          return reg.pushManager.getSubscription();
        })
        .then((sub) => {
          if (sub) {
            setIsSubscribed(true);
          }
        })
        .catch((err) => {
          console.warn('Service Worker registration note:', err);
        });
    }
  }, []);

  const subscribeToPush = useCallback(async () => {
    if (!isSupported) {
      setErrorMessage('Push notifications are not supported in this browser.');
      return false;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        setErrorMessage('Notification permission was not granted.');
        return false;
      }

      // 2. Fetch VAPID public key
      const keyRes = await fetch(`${API_BASE}/notifications/push/vapid-public-key`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      const keyData = await keyRes.json();
      const vapidPublicKey = keyData?.publicKey;

      if (!vapidPublicKey) {
        throw new Error('Server VAPID public key is not configured');
      }

      // 3. Register SW & subscribe PushManager
      const registration = await navigator.serviceWorker.ready;
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });

      const subJson = subscription.toJSON();

      // 4. Send subscription to Lunaria backend
      const res = await fetch(`${API_BASE}/notifications/push/subscribe`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          platform: 'web',
          token: subscription.endpoint,
          endpoint: subscription.endpoint,
          keys: subJson.keys,
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to register push subscription with Lunaria API');
      }

      setIsSubscribed(true);
      return true;
    } catch (err: any) {
      console.error('Error subscribing to push:', err);
      setErrorMessage(err.message || 'Failed to subscribe to push notifications');
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, getHeaders]);

  const unsubscribeFromPush = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        // Notify backend
        await fetch(`${API_BASE}/notifications/push/unsubscribe`, {
          method: 'POST',
          headers: getHeaders(),
          credentials: 'include',
          body: JSON.stringify({ token: subscription.endpoint }),
        });
      }

      setIsSubscribed(false);
      return true;
    } catch (err: any) {
      console.error('Error unsubscribing from push:', err);
      setErrorMessage(err.message || 'Failed to unsubscribe');
      return false;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    errorMessage,
    subscribeToPush,
    unsubscribeFromPush,
  };
}
