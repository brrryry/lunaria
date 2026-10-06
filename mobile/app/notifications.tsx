import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { apiFetch } from './api';

export default function MobileNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [markingAll, setMarkingAll] = useState<boolean>(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiFetch('/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.items || []);
      }
    } catch (err) {
      console.warn('Failed to load notifications:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await apiFetch(`/notifications/${id}/read`, {
        method: 'PATCH',
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      setMarkingAll(true);
      const res = await apiFetch('/notifications/mark-all-read', {
        method: 'POST',
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to mark all notifications as read.');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await apiFetch(`/notifications/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to remove notification.');
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'deposit_alert':
        return { name: 'arrow-down-left' as const, color: '#34d399' };
      case 'expense_alert':
        return { name: 'arrow-up-right' as const, color: '#f87171' };
      case 'budget_exceeded':
        return { name: 'alert-triangle' as const, color: '#fbbf24' };
      case 'account_disconnected':
        return { name: 'shield-off' as const, color: '#ef4444' };
      case 'daily_top_movers':
        return { name: 'trending-up' as const, color: '#818cf8' };
      default:
        return { name: 'bell' as const, color: '#6366f1' };
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#818cf8"
        />
      }
    >
      {/* Top Header Card */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.cardLabel}>NOTIFICATIONS & ALERTS</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount} New</Text>
              </View>
            )}
          </View>

          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={handleMarkAllRead}
              disabled={markingAll}
              style={styles.markAllBtn}
            >
              {markingAll ? (
                <ActivityIndicator size="small" color="#818cf8" />
              ) : (
                <Text style={styles.markAllText}>Mark all as read</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Notifications List */}
      <View style={styles.card}>
        {isLoading ? (
          <ActivityIndicator color="#818cf8" style={{ padding: 32 }} />
        ) : notifications.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Feather name="bell-off" size={32} color="#64748b" />
            <Text style={[styles.emptyTitle, { marginTop: 12 }]}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>
              You have no new alerts. Real-time updates for deposits, budgets, and security will appear here.
            </Text>
          </View>
        ) : (
          notifications.map((item) => {
            const icon = getNotificationIcon(item.type);
            const isUnread = !item.isRead;
            const dateStr = item.createdAt
              ? new Date(item.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '';

            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.7}
                onPress={() => isUnread && handleMarkAsRead(item.id)}
                style={[
                  styles.notificationItem,
                  isUnread && styles.notificationItemUnread,
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: `${icon.color}15` }]}>
                  <Feather name={icon.name} size={16} color={icon.color} />
                </View>

                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text
                      style={[
                        styles.itemTitle,
                        isUnread && { fontWeight: '700', color: '#ffffff' },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    {isUnread && <View style={styles.dot} />}
                  </View>

                  <Text style={styles.itemMessage} numberOfLines={2}>
                    {item.message}
                  </Text>

                  <Text style={styles.itemDate}>{dateStr}</Text>
                </View>

                <TouchableOpacity
                  onPress={() => handleDelete(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ padding: 4 }}
                >
                  <Feather name="trash-2" size={14} color="#64748b" />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090a0f',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    backgroundColor: '#11141f',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e2433',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  unreadBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unreadBadgeText: {
    color: '#818cf8',
    fontSize: 10,
    fontWeight: '700',
  },
  markAllBtn: {
    paddingVertical: 4,
  },
  markAllText: {
    color: '#818cf8',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1f2e',
  },
  notificationItemUnread: {
    backgroundColor: 'rgba(99, 102, 241, 0.04)',
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  itemTitle: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#818cf8',
  },
  itemMessage: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  itemDate: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 4,
  },
});
