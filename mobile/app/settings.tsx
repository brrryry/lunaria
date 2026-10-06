import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiFetch, getApiBaseUrl, getSessionUser, setSessionUser } from './api';
import { registerForPushNotificationsAsync } from './services/push';

export default function MobileSettings() {
  const router = useRouter();
  const sessionUser = getSessionUser();
  const [prefs, setPrefs] = useState<any>({
    emailEnabled: true,
    pushEnabled: true,
    inAppEnabled: true,

    accountDisconnected: true,
    accountDisconnectedEmail: true,
    accountDisconnectedPush: true,

    depositAlert: true,
    depositAlertEmail: true,
    depositAlertPush: true,
    depositMinAmount: '500.00',

    expenseAlert: true,
    expenseAlertEmail: true,
    expenseAlertPush: true,
    expenseMinAmount: '500.00',

    txNeedReview: true,
    txNeedReviewEmail: true,
    txNeedReviewPush: true,

    receiptImportError: true,
    receiptImportErrorEmail: true,
    receiptImportErrorPush: true,

    receiptImported: true,
    receiptImportedEmail: true,
    receiptImportedPush: true,

    receiptMatched: true,
    receiptMatchedEmail: true,
    receiptMatchedPush: true,

    dailyTopMovers: true,
    dailyTopMoversEmail: true,
    dailyTopMoversPush: true,

    budgetExceeded: true,
    budgetExceededEmail: true,
    budgetExceededPush: true,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPushRegistering, setIsPushRegistering] = useState<boolean>(false);
  const [devicePushToken, setDevicePushToken] = useState<string | null>(null);

  const [depositAmountInput, setDepositAmountInput] = useState<string>('500');
  const [expenseAmountInput, setExpenseAmountInput] = useState<string>('500');

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await apiFetch('/notifications/preferences');
      if (res.ok) {
        const data = await res.json();
        setPrefs(data);
        setDepositAmountInput(String(Math.round(Number(data.depositMinAmount) || 500)));
        setExpenseAmountInput(String(Math.round(Number(data.expenseMinAmount) || 500)));
      }
    } catch (err) {
      console.warn('Failed to load preferences:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreference = async (key: string, value: any) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);

    try {
      await apiFetch('/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify({ [key]: value }),
      });
    } catch (err) {
      console.error('Failed to update preference:', err);
    }
  };

  const handleSaveThreshold = async (field: 'deposit' | 'expense') => {
    const isDep = field === 'deposit';
    const amountVal = isDep ? depositAmountInput : expenseAmountInput;
    const num = parseFloat(amountVal);
    if (isNaN(num) || num < 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    const key = isDep ? 'depositMinAmount' : 'expenseMinAmount';
    await updatePreference(key, num);
    Alert.alert('Saved', `${isDep ? 'Deposit' : 'Expense'} threshold updated to $${num}.`);
  };

  const handleRegisterDevicePush = async () => {
    try {
      setIsPushRegistering(true);
      const currentUser = getSessionUser();
      if (!currentUser?.id) {
        Alert.alert('Authentication Required', 'Please log in to register push alerts.');
        return;
      }
      const baseUrl = getApiBaseUrl();
      const token = await registerForPushNotificationsAsync(currentUser.id, baseUrl);
      if (token) {
        setDevicePushToken(token);
        Alert.alert('Device Registered', 'This device is now registered to receive native OS push alerts.');
      } else {
        Alert.alert(
          'Push Registration',
          'Could not register for push notifications. Ensure you are on a physical mobile device with push permissions enabled.',
        );
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to register device for push.');
    } finally {
      setIsPushRegistering(false);
    }
  };

  const handleSignOut = () => {
    const doLogout = () => {
      setSessionUser(null);
      router.replace('/login');
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm('Are you sure you want to sign out of Lunaria?')
          : true;
      if (confirmed) {
        doLogout();
      }
      return;
    }

    Alert.alert('Sign Out', 'Are you sure you want to sign out of Lunaria?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: doLogout,
      },
    ]);
  };

  const renderChannelToggle = (
    emailKey: string,
    pushKey: string,
    emailVal?: boolean,
    pushVal?: boolean,
  ) => (
    <View style={styles.channelRow}>
      <TouchableOpacity
        onPress={() => updatePreference(emailKey, !emailVal)}
        style={[
          styles.channelPill,
          emailVal && styles.channelPillActive,
        ]}
      >
        <Feather name="mail" size={10} color={emailVal ? '#c7d2fe' : '#64748b'} />
        <Text style={[styles.channelText, emailVal && styles.channelTextActive]}>
          Email
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => updatePreference(pushKey, !pushVal)}
        style={[
          styles.channelPill,
          pushVal && styles.channelPillActive,
        ]}
      >
        <Feather name="smartphone" size={10} color={pushVal ? '#c7d2fe' : '#64748b'} />
        <Text style={[styles.channelText, pushVal && styles.channelTextActive]}>
          Push
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Account Profile Card */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>ACTIVE PROFILE</Text>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutHeaderBtn}>
            <Feather name="log-out" size={12} color="#f87171" />
            <Text style={styles.signOutHeaderText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.profileRow}>
          <View style={styles.avatarBox}>
            <Text style={styles.avatarLetter}>
              {(sessionUser?.fullName || 'User')[0]}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>
              {sessionUser?.fullName || 'Account User'}
            </Text>
            <Text style={styles.profileEmail}>
              {sessionUser?.email || 'user@example.com'}
            </Text>
          </View>

          <View style={styles.activePill}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>Active</Text>
          </View>
        </View>
      </View>
      {/* Delivery Channels Card */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>DELIVERY CHANNELS</Text>
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Email Alerts</Text>
            <Text style={styles.switchSub}>Direct to your email inbox</Text>
          </View>
          <Switch
            value={prefs.emailEnabled}
            onValueChange={(val) => updatePreference('emailEnabled', val)}
            trackColor={{ false: '#1e2433', true: '#4f46e5' }}
            thumbColor="#ffffff"
          />
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Mobile & Web Push</Text>
            <Text style={styles.switchSub}>Instant OS notifications</Text>
          </View>
          <Switch
            value={prefs.pushEnabled}
            onValueChange={(val) => updatePreference('pushEnabled', val)}
            trackColor={{ false: '#1e2433', true: '#4f46e5' }}
            thumbColor="#ffffff"
          />
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>In-App Notification Center</Text>
            <Text style={styles.switchSub}>Bell icon badge and dropdown</Text>
          </View>
          <Switch
            value={prefs.inAppEnabled}
            onValueChange={(val) => updatePreference('inAppEnabled', val)}
            trackColor={{ false: '#1e2433', true: '#4f46e5' }}
            thumbColor="#ffffff"
          />
        </View>

        {/* Device Push Registration Card */}
        <View style={styles.pushBox}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="smartphone" size={14} color="#818cf8" />
              <Text style={styles.pushBoxTitle}>This Mobile Device</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: devicePushToken ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.2)' }]}>
              <Text style={[styles.badgeText, { color: devicePushToken ? '#34d399' : '#94a3b8' }]}>
                {devicePushToken ? 'Registered' : 'Not Registered'}
              </Text>
            </View>
          </View>

          <Text style={styles.pushBoxDesc}>
            Register this phone with the Lunaria Push Gateway (Expo Push) to receive native alerts even when the app is closed.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <TouchableOpacity
              onPress={handleRegisterDevicePush}
              disabled={isPushRegistering}
              style={styles.pushBtn}
            >
              {isPushRegistering ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.pushBtnText}>Enable Push on Device</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Account Alerts */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>ACCOUNT ALERTS</Text>
        </View>

        <View style={styles.settingItem}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.itemTitle}>Account Disconnected</Text>
            <Text style={styles.itemSub}>Notify if a bank account needs reconnection</Text>
          </View>
          {renderChannelToggle(
            'accountDisconnectedEmail',
            'accountDisconnectedPush',
            prefs.accountDisconnectedEmail,
            prefs.accountDisconnectedPush,
          )}
        </View>
      </View>

      {/* Transaction Alerts */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>TRANSACTION ALERTS</Text>
        </View>

        {/* Deposit Alert */}
        <View style={styles.settingItemCol}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.itemTitle}>Deposit Alert</Text>
              <Text style={styles.itemSub}>When a deposit syncs above threshold</Text>
            </View>
            {renderChannelToggle(
              'depositAlertEmail',
              'depositAlertPush',
              prefs.depositAlertEmail,
              prefs.depositAlertPush,
            )}
          </View>

          <View style={styles.thresholdBox}>
            <Text style={styles.thresholdLabel}>Minimum Amount: $</Text>
            <TextInput
              style={styles.thresholdInput}
              keyboardType="numeric"
              value={depositAmountInput}
              onChangeText={setDepositAmountInput}
            />
            <TouchableOpacity
              onPress={() => handleSaveThreshold('deposit')}
              style={styles.saveSmallBtn}
            >
              <Text style={styles.saveSmallBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Expense Alert */}
        <View style={styles.settingItemCol}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.itemTitle}>Expense Alert</Text>
              <Text style={styles.itemSub}>When an expense syncs above threshold</Text>
            </View>
            {renderChannelToggle(
              'expenseAlertEmail',
              'expenseAlertPush',
              prefs.expenseAlertEmail,
              prefs.expenseAlertPush,
            )}
          </View>

          <View style={styles.thresholdBox}>
            <Text style={styles.thresholdLabel}>Minimum Amount: $</Text>
            <TextInput
              style={styles.thresholdInput}
              keyboardType="numeric"
              value={expenseAmountInput}
              onChangeText={setExpenseAmountInput}
            />
            <TouchableOpacity
              onPress={() => handleSaveThreshold('expense')}
              style={styles.saveSmallBtn}
            >
              <Text style={styles.saveSmallBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Needs Review */}
        <View style={styles.settingItem}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.itemTitle}>Transactions Needing Review</Text>
            <Text style={styles.itemSub}>Notify for uncategorized purchases</Text>
          </View>
          {renderChannelToggle(
            'txNeedReviewEmail',
            'txNeedReviewPush',
            prefs.txNeedReviewEmail,
            prefs.txNeedReviewPush,
          )}
        </View>
      </View>

      {/* Budget & Investment Alerts */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>BUDGET & INVESTMENT ALERTS</Text>
        </View>

        {/* Budget Exceeded */}
        <View style={styles.settingItem}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.itemTitle}>Budget Exceeded</Text>
            <Text style={styles.itemSub}>
              Alert when a category limit is breached (max 1/month anti-spam)
            </Text>
          </View>
          {renderChannelToggle(
            'budgetExceededEmail',
            'budgetExceededPush',
            prefs.budgetExceededEmail,
            prefs.budgetExceededPush,
          )}
        </View>

        {/* Daily Top Movers */}
        <View style={styles.settingItem}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.itemTitle}>Daily Top Movers</Text>
            <Text style={styles.itemSub}>Daily portfolio change & market movers</Text>
          </View>
          {renderChannelToggle(
            'dailyTopMoversEmail',
            'dailyTopMoversPush',
            prefs.dailyTopMoversEmail,
            prefs.dailyTopMoversPush,
          )}
        </View>
      </View>

      {/* Security Architecture */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardLabel}>SYSTEM & SECURITY</Text>
        </View>

        <View style={styles.securityRow}>
          <Text style={styles.securityLabel}>Zero-Casual-Access Model</Text>
          <Text style={styles.securityValActive}>Enforced</Text>
        </View>
        <View style={styles.securityRow}>
          <Text style={styles.securityLabel}>Plaid Token Encryption</Text>
          <Text style={styles.securityVal}>AES-256-GCM</Text>
        </View>
        <View style={styles.securityRow}>
          <Text style={styles.securityLabel}>TimescaleDB Portfolio Engine</Text>
          <Text style={styles.securityValActive}>Active (730d)</Text>
        </View>
      </View>

      {/* Prominent Sign Out Button */}
      <TouchableOpacity
        onPress={handleSignOut}
        activeOpacity={0.8}
        style={styles.bottomSignOutBtn}
      >
        <Feather name="log-out" size={16} color="#f87171" />
        <Text style={styles.bottomSignOutText}>Sign Out of Lunaria</Text>
      </TouchableOpacity>
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
    gap: 14,
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  switchTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  switchSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  pushBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e2433',
    gap: 8,
    marginTop: 6,
  },
  pushBoxTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  pushBoxDesc: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
  },
  pushBtn: {
    flex: 1,
    backgroundColor: '#4f46e5',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  pushBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  settingItemCol: {
    paddingVertical: 6,
    gap: 8,
  },
  itemTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  itemSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  channelRow: {
    flexDirection: 'row',
    gap: 6,
  },
  channelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#090a0f',
    borderWidth: 1,
    borderColor: '#1e2433',
  },
  channelPillActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: '#6366f1',
  },
  channelText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
  },
  channelTextActive: {
    color: '#c7d2fe',
  },
  thresholdBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#090a0f',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#1e2433',
  },
  thresholdLabel: {
    color: '#94a3b8',
    fontSize: 11,
  },
  thresholdInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    padding: 0,
  },
  saveSmallBtn: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  saveSmallBtnText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  securityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1f2e',
  },
  securityLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  securityVal: {
    color: '#c7d2fe',
    fontSize: 12,
    fontWeight: '600',
  },
  securityValActive: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '700',
  },
  signOutHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  signOutHeaderText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '600',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  avatarBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  avatarLetter: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  profileName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  profileEmail: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34d399',
  },
  activeText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomSignOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginTop: 8,
  },
  bottomSignOutText: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '700',
  },
});
