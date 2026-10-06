import { Platform } from 'react-native';

/**
 * Registers this mobile device for production push notifications via the Lunaria API & Expo Push Service.
 *
 * In production or Expo Go on a physical phone, this requests OS push permissions and submits the
 * ExponentPushToken to your backend. The backend uses Expo's push gateway (https://exp.host/--/api/v2/push/send)
 * to deliver notifications to iOS APNs and Android FCM.
 */
export async function registerForPushNotificationsAsync(
  userId: string,
  apiBase: string = 'http://localhost:3001/api',
): Promise<string | null> {
  // Never attempt native mobile push on web
  if (Platform.OS === 'web') {
    console.log('[Web] Mobile Expo Push is for physical iOS and Android devices.');
    return null;
  }

  try {
    // Dynamically require native modules only on iOS/Android
    const Notifications = require('expo-notifications');
    const Device = require('expo-device');

    if (Device && !Device.isDevice) {
      console.log('Push notifications require a physical device for remote push delivery.');
    }

    // Set notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token: permission denied.');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Register token with Lunaria backend
    await fetch(`${apiBase}/notifications/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        platform: 'expo',
        token,
        userAgent: `${Platform.OS}-${Platform.Version}`,
      }),
    });

    console.log(`Successfully registered Expo push token: ${token}`);
    return token;
  } catch (error) {
    console.warn('Error registering mobile push token:', error);
    return null;
  }
}
