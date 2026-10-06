import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { apiFetch, getSessionUser } from './api';

export default function AppLayout() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    // Check if user session exists
    const user = getSessionUser();
    if (!user) {
      router.replace('/login');
    }
  }, [router]);

  useEffect(() => {
    let isMounted = true;
    const checkNotifications = async () => {
      try {
        const res = await apiFetch('/notifications');
        if (res.ok) {
          const data = await res.json();
          const unread = (data.items || []).filter((n: any) => !n.isRead).length;
          if (isMounted) setUnreadCount(unread);
        }
      } catch (err) {
        // silent
      }
    };

    checkNotifications();
    const interval = setInterval(checkNotifications, 20000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const HeaderRightActions = () => (
    <View style={styles.headerRight}>
      <TouchableOpacity
        onPress={() => router.push('/notifications')}
        style={styles.iconButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="bell" size={18} color="#e2e8f0" />
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push('/settings')}
        style={styles.iconButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="settings" size={18} color="#e2e8f0" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#090a0f' }}>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerStyle: {
            backgroundColor: '#090a0f',
            borderBottomColor: '#1e2433',
            borderBottomWidth: 1,
          },
          headerTintColor: '#ffffff',
          headerTitleStyle: {
            fontSize: 16,
            fontWeight: '700',
          },
          headerRight: HeaderRightActions,
          tabBarStyle: {
            backgroundColor: '#0b0e14',
            borderTopColor: '#1e2433',
            height: 60,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarActiveTintColor: '#818cf8',
          tabBarInactiveTintColor: '#64748b',
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
          },
        }}
      >
        {/* 1. Dashboard Tab */}
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            headerTitle: 'Lunaria',
            tabBarIcon: ({ color, size }) => (
              <Feather name="home" size={size || 20} color={color} />
            ),
          }}
        />

        {/* 2. Budget Tab */}
        <Tabs.Screen
          name="budget"
          options={{
            title: 'Budget',
            headerTitle: 'Monthly Budget',
            tabBarIcon: ({ color, size }) => (
              <Feather name="pie-chart" size={size || 20} color={color} />
            ),
          }}
        />

        {/* 3. Transactions Tab */}
        <Tabs.Screen
          name="transactions"
          options={{
            title: 'Activity',
            headerTitle: 'Transactions',
            tabBarIcon: ({ color, size }) => (
              <Feather name="repeat" size={size || 20} color={color} />
            ),
          }}
        />

        {/* 4. Investments Tab */}
        <Tabs.Screen
          name="investments"
          options={{
            title: 'Invest',
            headerTitle: 'Investments',
            tabBarIcon: ({ color, size }) => (
              <Feather name="trending-up" size={size || 20} color={color} />
            ),
          }}
        />

        {/* 5. Accounts Tab */}
        <Tabs.Screen
          name="accounts"
          options={{
            title: 'Accounts',
            headerTitle: 'Linked Accounts',
            tabBarIcon: ({ color, size }) => (
              <Feather name="credit-card" size={size || 20} color={color} />
            ),
          }}
        />

        {/* Modals / Sub-screens (hidden from tab bar) */}
        <Tabs.Screen
          name="notifications"
          options={{
            href: null,
            title: 'Notifications',
            headerTitle: 'Alerts & Notifications',
          }}
        />

        <Tabs.Screen
          name="settings"
          options={{
            href: null,
            title: 'Settings',
            headerTitle: 'Settings & Notifications',
          }}
        />

        <Tabs.Screen
          name="login"
          options={{
            href: null,
            title: 'Sign In',
            headerShown: false,
            tabBarStyle: { display: 'none' },
          }}
        />
      </Tabs>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginRight: 16,
  },
  iconButton: {
    position: 'relative',
    padding: 4,
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  unreadText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
});
