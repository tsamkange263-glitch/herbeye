import { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@fastshot/auth';
import { Colors } from '@/constants/Colors';
import { Fonts } from '@/constants/Typography';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/useAppStore';
import { logError } from '@/lib/error-utils';
import { fetchOrCreateProfile } from '@/lib/ensure-user-profile';

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { profile, setProfile, reset } = useAppStore();
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const profileData = await fetchOrCreateProfile(user.id, user.email);
      if (profileData) setProfile(profileData);
    } catch (e: unknown) {
      logError('[account] Error fetching account data', e);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const performSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      reset();
      await signOut();
      setShowSignOutModal(false);
      // AuthProvider handles redirect to login via AuthRedirectHandler
      // But as a fallback, navigate explicitly
      router.replace('/(auth)/login');
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : 'Failed to sign out. Please try again.';
      setSignOutError(message);
      logError('[account] Sign out failed', e);
    } finally {
      setSigningOut(false);
    }
  };

  const handleSignOut = () => {
    setSignOutError(null);
    if (Platform.OS === 'web') {
      // Alert.alert doesn't work on web — show a custom modal instead
      setShowSignOutModal(true);
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: performSignOut,
        },
      ]);
    }
  };

  const displayName =
    profile?.full_name || user?.email?.split('@')[0] || 'User';
  const email = user?.email || '';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: 40,
        paddingHorizontal: 20,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontFamily: Fonts.extraBold,
          fontSize: 28,
          color: Colors.textPrimary,
          marginBottom: 20,
        }}
      >
        Account
      </Text>

      {/* Profile card */}
      <View
        style={{
          backgroundColor: Colors.card,
          borderRadius: 20,
          borderCurve: 'continuous',
          padding: 20,
          alignItems: 'center',
          gap: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: Colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: Fonts.bold,
              fontSize: 26,
              color: Colors.white,
            }}
          >
            {initials}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: Fonts.bold,
            fontSize: 20,
            color: Colors.textPrimary,
          }}
        >
          {displayName}
        </Text>
        <Text
          selectable
          style={{
            fontFamily: Fonts.regular,
            fontSize: 14,
            color: Colors.textSecondary,
          }}
        >
          {email}
        </Text>
      </View>

      {/* Credits */}
      <View
        style={{
          backgroundColor: Colors.card,
          borderRadius: 18,
          borderCurve: 'continuous',
          padding: 18,
          marginTop: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              borderCurve: 'continuous',
              backgroundColor: 'rgba(46,125,50,0.1)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="leaf" size={22} color={Colors.primary} />
          </View>
          <View>
            <Text
              style={{
                fontFamily: Fonts.regular,
                fontSize: 13,
                color: Colors.textSecondary,
              }}
            >
              Scan Credits
            </Text>
            <Text
              style={{
                fontFamily: Fonts.bold,
                fontSize: 22,
                color: Colors.textPrimary,
                fontVariant: ['tabular-nums'],
              }}
            >
              {profile?.scan_credits ?? 0}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => router.push('/topup')}
          style={{
            backgroundColor: Colors.primary,
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: 12,
            borderCurve: 'continuous',
          }}
        >
          <Text
            style={{
              fontFamily: Fonts.bold,
              fontSize: 14,
              color: Colors.white,
            }}
          >
            Top Up
          </Text>
        </Pressable>
      </View>

      {/* Menu items */}
      <View style={{ marginTop: 20, gap: 2 }}>
        {[
          {
            icon: 'receipt-outline' as const,
            label: 'Payment History',
            action: () => router.push('/payment-history'),
          },
          {
            icon: 'help-circle-outline' as const,
            label: 'Help & Support',
            action: () => router.push('/help-support'),
          },
          {
            icon: 'information-circle-outline' as const,
            label: 'About HerbEye',
            action: () => router.push('/about'),
          },
        ].map((item, i) => (
          <Pressable
            key={i}
            onPress={item.action}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: Colors.card,
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderRadius: i === 0 ? 16 : i === 2 ? 16 : 0,
              borderTopLeftRadius: i === 0 ? 16 : 0,
              borderTopRightRadius: i === 0 ? 16 : 0,
              borderBottomLeftRadius: i === 2 ? 16 : 0,
              borderBottomRightRadius: i === 2 ? 16 : 0,
              gap: 12,
              opacity: pressed ? 0.9 : 1,
              borderBottomWidth: i < 2 ? 0.5 : 0,
              borderBottomColor: Colors.border,
            })}
          >
            <Ionicons name={item.icon} size={22} color={Colors.primary} />
            <Text
              style={{
                flex: 1,
                fontFamily: Fonts.semiBold,
                fontSize: 15,
                color: Colors.textPrimary,
              }}
            >
              {item.label}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        ))}
      </View>


      {/* Sign out error banner */}
      {signOutError && (
        <View
          style={{
            backgroundColor: 'rgba(211,47,47,0.08)',
            borderRadius: 12,
            padding: 14,
            marginTop: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderWidth: 1,
            borderColor: 'rgba(211,47,47,0.2)',
          }}
        >
          <Ionicons name="warning-outline" size={18} color={Colors.error} />
          <Text
            style={{
              flex: 1,
              fontFamily: Fonts.regular,
              fontSize: 13,
              color: Colors.error,
            }}
          >
            {signOutError}
          </Text>
          <Pressable onPress={() => setSignOutError(null)} hitSlop={8}>
            <Ionicons name="close" size={18} color={Colors.error} />
          </Pressable>
        </View>
      )}

      {/* Sign out */}
      <Pressable
        onPress={handleSignOut}
        disabled={signingOut}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: Colors.card,
          paddingVertical: 16,
          borderRadius: 16,
          borderCurve: 'continuous',
          marginTop: signOutError ? 12 : 24,
          borderWidth: 1.5,
          borderColor: 'rgba(211,47,47,0.2)',
          opacity: pressed || signingOut ? 0.6 : 1,
        })}
      >
        {signingOut ? (
          <ActivityIndicator size="small" color={Colors.error} />
        ) : (
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
        )}
        <Text
          style={{
            fontFamily: Fonts.bold,
            fontSize: 15,
            color: Colors.error,
          }}
        >
          {signingOut ? 'Signing Out...' : 'Sign Out'}
        </Text>
      </Pressable>

      {/* Version */}
      <Text
        style={{
          fontFamily: Fonts.regular,
          fontSize: 12,
          color: Colors.textLight,
          textAlign: 'center',
          marginTop: 16,
        }}
      >
        HerbEye v1.0.0
      </Text>

      {/* Sign out confirmation modal (web-compatible) */}
      <Modal
        visible={showSignOutModal}
        transparent
        animationType="fade"
        onRequestClose={() => !signingOut && setShowSignOutModal(false)}
      >
        <Pressable
          onPress={() => !signingOut && setShowSignOutModal(false)}
          style={{
            flex: 1,
            backgroundColor: Colors.overlay,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: Colors.card,
              borderRadius: 20,
              borderCurve: 'continuous',
              padding: 28,
              width: '100%',
              maxWidth: 340,
              alignItems: 'center',
              gap: 12,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: 'rgba(211,47,47,0.1)',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 4,
              }}
            >
              <Ionicons name="log-out-outline" size={28} color={Colors.error} />
            </View>
            <Text
              style={{
                fontFamily: Fonts.bold,
                fontSize: 18,
                color: Colors.textPrimary,
                textAlign: 'center',
              }}
            >
              Sign Out
            </Text>
            <Text
              style={{
                fontFamily: Fonts.regular,
                fontSize: 14,
                color: Colors.textSecondary,
                textAlign: 'center',
                lineHeight: 20,
              }}
            >
              Are you sure you want to sign out? You&apos;ll need to log in again to access your account.
            </Text>

            {signOutError && (
              <View
                style={{
                  backgroundColor: 'rgba(211,47,47,0.08)',
                  borderRadius: 10,
                  padding: 12,
                  width: '100%',
                  marginTop: 4,
                }}
              >
                <Text
                  style={{
                    fontFamily: Fonts.regular,
                    fontSize: 12,
                    color: Colors.error,
                    textAlign: 'center',
                  }}
                >
                  {signOutError}
                </Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' }}>
              <Pressable
                onPress={() => setShowSignOutModal(false)}
                disabled={signingOut}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  borderCurve: 'continuous',
                  backgroundColor: Colors.background,
                  alignItems: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: Fonts.bold,
                    fontSize: 15,
                    color: Colors.textPrimary,
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={performSignOut}
                disabled={signingOut}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  borderCurve: 'continuous',
                  backgroundColor: Colors.error,
                  alignItems: 'center',
                  opacity: pressed || signingOut ? 0.7 : 1,
                })}
              >
                {signingOut ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text
                    style={{
                      fontFamily: Fonts.bold,
                      fontSize: 15,
                      color: Colors.white,
                    }}
                  >
                    Sign Out
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
