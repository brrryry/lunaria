import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getApiBaseUrl, setSessionUser, DEMO_USER } from './api';

export default function MobileLogin() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Check for token from OAuth redirect
  useEffect(() => {
    let token = params.token;
    if (!token && Platform.OS === 'web' && typeof window !== 'undefined') {
      token = new URLSearchParams(window.location.search).get('token') || undefined;
    }

    if (token) {
      setIsLoading(true);
      const apiUrl = getApiBaseUrl();
      fetch(`${apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.user) {
            setSessionUser({
              id: data.user.id,
              email: data.user.email,
              fullName: data.user.fullName,
              avatarUrl: data.user.avatarUrl,
              token,
            });
            router.replace('/');
          }
        })
        .catch((err) => {
          console.warn('OAuth session token resolution failed:', err);
        })
        .finally(() => setIsLoading(false));
    }
  }, [params, router]);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    const apiUrl = getApiBaseUrl();
    const returnUrl =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/login`
        : 'finance.lunaria.app://login';
    const targetUrl = `${apiUrl}/auth/google?redirect_to=${encodeURIComponent(returnUrl)}`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.location.href = targetUrl;
      }
    } else {
      try {
        await Linking.openURL(targetUrl);
      } catch (err) {
        console.warn('Could not open Google auth URL:', err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDemoLogin = async () => {
    setIsLoading(true);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/auth/demo-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: DEMO_USER.email }),
      });

      if (res.ok) {
        const data = await res.json();
        setSessionUser(data.user);
        router.replace('/');
        return;
      }
    } catch (err) {
      console.warn('Demo login failed, falling back:', err);
    } finally {
      setIsLoading(false);
    }
    setSessionUser(DEMO_USER);
    router.replace('/');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      bounces={false}
    >
      {/* Background ambient accent circles */}
      <View style={styles.ambientGlowTop} />
      <View style={styles.ambientGlowBottom} />

      {/* Brand Header */}
      <View style={styles.brandHeader}>
        <View style={styles.logoBadge}>
          <Feather name="trending-up" size={30} color="#ffffff" />
        </View>

        <Text style={styles.titleText}>Lunaria</Text>
        <Text style={styles.subtitleText}>
          Unified wealth tracking, cash flow, and portfolio intelligence.
        </Text>
      </View>

      {/* Login Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sign in to continue</Text>
        <Text style={styles.cardSubtitle}>
          Access your real-time bank feeds, net worth trajectory, and monthly budgets.
        </Text>

        <View style={styles.buttonStack}>
          {/* Google Sign-in Button */}
          <TouchableOpacity
            onPress={handleGoogleLogin}
            disabled={isLoading}
            activeOpacity={0.8}
            style={styles.googleButton}
          >
            {isLoading ? (
              <ActivityIndicator color="#0f172a" size="small" />
            ) : (
              <>
                <View style={styles.googleIconBox}>
                  <Text style={styles.googleIconLetter}>G</Text>
                </View>
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Quick Demo Login */}
          <TouchableOpacity
            onPress={handleDemoLogin}
            activeOpacity={0.8}
            style={styles.demoButton}
          >
            <Feather name="user-check" size={16} color="#c7d2fe" />
            <Text style={styles.demoButtonText}>Continue with Demo Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    minHeight: 640,
  },
  ambientGlowTop: {
    position: 'absolute',
    top: 60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    transform: [{ scale: 1.2 }],
  },
  ambientGlowBottom: {
    position: 'absolute',
    bottom: 40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(168, 85, 247, 0.06)',
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  titleText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitleText: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
    lineHeight: 18,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(14, 18, 27, 0.95)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1e2433',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardSubtitle: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
    lineHeight: 16,
  },
  buttonStack: {
    gap: 12,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  googleIconBox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4285f4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  googleIconLetter: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  googleButtonText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181d2a',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2d3748',
    gap: 8,
  },
  demoButtonText: {
    color: '#c7d2fe',
    fontSize: 13,
    fontWeight: '600',
  },
});
