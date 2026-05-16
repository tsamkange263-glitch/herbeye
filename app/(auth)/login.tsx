import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@fastshot/auth';
import { Colors } from '@/constants/Colors';
import { Fonts } from '@/constants/Typography';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

/**
 * Translates Supabase error messages into user-friendly messages for signup.
 */
function formatSignUpError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();

  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'An account with this email already exists. Try logging in instead.';
  }
  if (lower.includes('password') && (lower.includes('weak') || lower.includes('short') || lower.includes('at least'))) {
    return rawMessage;
  }
  if (lower.includes('invalid') && lower.includes('email')) {
    return 'Please enter a valid email address.';
  }
  if (lower.includes('rate') || lower.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    return 'Connection error. Please check your internet and try again.';
  }

  return rawMessage;
}

/**
 * Translates login error messages into user-friendly messages.
 */
function formatLoginError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();

  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return 'Incorrect email or password. Please try again.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please verify your email address before logging in.';
  }
  if (lower.includes('rate') || lower.includes('too many')) {
    return 'Too many login attempts. Please wait a moment and try again.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    return 'Connection error. Please check your internet and try again.';
  }
  if (lower.includes('user not found') || lower.includes('no user')) {
    return 'Incorrect email or password. Please try again.';
  }

  return rawMessage;
}

/**
 * Calls the auto-confirm edge function to confirm a user's email immediately.
 */
async function autoConfirmUser(userId: string): Promise<void> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

  const response = await fetch(`${supabaseUrl}/functions/v1/auto-confirm-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ user_id: userId }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to confirm account');
  }
}

/**
 * Attempts to sign in with retries. After auto-confirm, Supabase may need
 * a brief moment to propagate the confirmation.
 */
async function signInWithRetry(
  email: string,
  password: string,
  maxAttempts = 3,
  delayMs = 800
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (data?.session) {
      return { success: true };
    }

    // On last attempt, return the error
    if (attempt === maxAttempts - 1) {
      return {
        success: false,
        error: error?.message || 'Sign in failed. Please try logging in manually.',
      };
    }

    // If the error is NOT about credentials being wrong, don't retry
    const lower = (error?.message || '').toLowerCase();
    if (!lower.includes('invalid login credentials') && !lower.includes('email not confirmed')) {
      return { success: false, error: error?.message || 'Sign in failed.' };
    }
  }

  return { success: false, error: 'Sign in failed. Please try again.' };
}

export default function LoginScreen() {
  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [signUpLoading, setSignUpLoading] = useState(false);
  const [signUpError, setSignUpError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ confirmed?: string; error?: string }>();

  const {
    signInWithGoogle,
    signInWithEmail,
    isLoading,
    error,
    clearError,
  } = useAuth();

  // Handle redirect params
  useEffect(() => {
    if (params.confirmed === 'true') {
      setSuccessMessage('Account created! You can now log in.');
      const timer = setTimeout(() => setSuccessMessage(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [params.confirmed]);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      return;
    }
    if (isRegister && !fullName.trim()) {
      return;
    }

    setSuccessMessage(null);
    setSignUpError(null);
    clearError();

    try {
      if (isRegister) {
        setSignUpLoading(true);

        // Step 1: Create the auth user via Supabase signUp
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
          },
        });

        if (signUpErr) {
          setSignUpError(formatSignUpError(signUpErr.message));
          setSignUpLoading(false);
          return;
        }

        if (!signUpData.user) {
          setSignUpError('Account creation failed. Please try again.');
          setSignUpLoading(false);
          return;
        }

        // Step 2: The DB trigger `handle_new_user` will create the profile row
        // automatically. We don't need to call ensureUserProfile here since
        // we don't have a session yet and RLS would block it anyway.

        // Step 3: Sign the user in
        if (signUpData.session) {
          // Supabase returned a session = email confirmation not required.
          // User is already authenticated. Use signInWithEmail from @fastshot/auth
          // so the auth provider picks up the session and redirects automatically.
          await signInWithEmail(email.trim(), password);
          setSignUpLoading(false);
          return;
        }

        // No session = email confirmation is required by Supabase settings.
        // Auto-confirm via edge function, then sign in with retry.
        try {
          await autoConfirmUser(signUpData.user.id);
        } catch (confirmErr) {
          // If auto-confirm fails, still try to sign in — maybe it was already confirmed
          console.warn('[signup] Auto-confirm failed:', confirmErr);
        }

        // Give Supabase a moment to propagate the confirmation, then sign in
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Try signing in with retries (handles propagation delay)
        const signInResult = await signInWithRetry(email.trim(), password);

        if (signInResult.success) {
          // Session is now established in supabase client.
          // Use signInWithEmail from @fastshot/auth to trigger the provider's redirect.
          await signInWithEmail(email.trim(), password);
        } else {
          // If retries all failed, show a helpful error
          setSignUpError(
            'Your account was created but sign-in is taking a moment. Please tap Login to sign in.'
          );
          // Switch to login mode so user can tap Login
          setIsRegister(false);
        }

        setSignUpLoading(false);
      } else {
        // LOGIN FLOW
        await signInWithEmail(email.trim(), password);
        // @fastshot/auth handles redirect automatically on success
      }
    } catch (e: unknown) {
      setSignUpLoading(false);
      const msg = e instanceof Error ? e.message : 'Authentication failed';
      if (isRegister) {
        setSignUpError(formatSignUpError(msg));
      }
      // For login errors, @fastshot/auth sets the error state automatically
    }
  };

  const toggleMode = () => {
    clearError();
    setSignUpError(null);
    setIsRegister(!isRegister);
    setSuccessMessage(null);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 20,
          paddingHorizontal: 24,
          justifyContent: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: 36 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: 'rgba(46,125,50,0.1)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Ionicons name="leaf" size={36} color={Colors.primary} />
          </View>
          <Text
            style={{
              fontFamily: Fonts.extraBold,
              fontSize: 28,
              color: Colors.primary,
              letterSpacing: -0.5,
            }}
          >
            HerbEye
          </Text>
        </View>

        {/* Success Banner */}
        {successMessage && (
          <View
            style={{
              backgroundColor: 'rgba(46,125,50,0.08)',
              borderRadius: 12,
              borderCurve: 'continuous',
              padding: 14,
              marginBottom: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderWidth: 1,
              borderColor: 'rgba(46,125,50,0.15)',
            }}
          >
            <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
            <Text
              style={{
                fontFamily: Fonts.semiBold,
                fontSize: 14,
                color: Colors.primary,
                flex: 1,
              }}
            >
              {successMessage}
            </Text>
            <Pressable onPress={() => setSuccessMessage(null)} hitSlop={8}>
              <Ionicons name="close" size={18} color={Colors.primary} />
            </Pressable>
          </View>
        )}

        {/* Toggle */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: Colors.card,
            borderRadius: 14,
            borderCurve: 'continuous',
            padding: 4,
            marginBottom: 24,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          {['Login', 'Register'].map((label, i) => {
            const active = i === 0 ? !isRegister : isRegister;
            return (
              <Pressable
                key={label}
                onPress={() => (i === 0 ? setIsRegister(false) : setIsRegister(true))}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 11,
                  borderCurve: 'continuous',
                  backgroundColor: active ? Colors.primary : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: Fonts.bold,
                    fontSize: 15,
                    color: active ? Colors.white : Colors.textSecondary,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Form */}
        <View style={{ gap: 14 }}>
          {isRegister && (
            <View>
              <Text
                style={{
                  fontFamily: Fonts.semiBold,
                  fontSize: 13,
                  color: Colors.textSecondary,
                  marginBottom: 6,
                  marginLeft: 4,
                }}
              >
                Full Name
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: Colors.card,
                  borderRadius: 14,
                  borderCurve: 'continuous',
                  borderWidth: 1.5,
                  borderColor: Colors.border,
                  paddingHorizontal: 14,
                }}
              >
                <Ionicons name="person-outline" size={18} color={Colors.textLight} />
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Your full name"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="words"
                  style={{
                    flex: 1,
                    fontFamily: Fonts.regular,
                    fontSize: 15,
                    color: Colors.textPrimary,
                    paddingVertical: 14,
                    paddingLeft: 10,
                  }}
                />
              </View>
            </View>
          )}

          <View>
            <Text
              style={{
                fontFamily: Fonts.semiBold,
                fontSize: 13,
                color: Colors.textSecondary,
                marginBottom: 6,
                marginLeft: 4,
              }}
            >
              Email Address
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: Colors.card,
                borderRadius: 14,
                borderCurve: 'continuous',
                borderWidth: 1.5,
                borderColor: Colors.border,
                paddingHorizontal: 14,
              }}
            >
              <Ionicons name="mail-outline" size={18} color={Colors.textLight} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                style={{
                  flex: 1,
                  fontFamily: Fonts.regular,
                  fontSize: 15,
                  color: Colors.textPrimary,
                  paddingVertical: 14,
                  paddingLeft: 10,
                }}
              />
            </View>
          </View>

          <View>
            <Text
              style={{
                fontFamily: Fonts.semiBold,
                fontSize: 13,
                color: Colors.textSecondary,
                marginBottom: 6,
                marginLeft: 4,
              }}
            >
              Password
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: Colors.card,
                borderRadius: 14,
                borderCurve: 'continuous',
                borderWidth: 1.5,
                borderColor: Colors.border,
                paddingHorizontal: 14,
              }}
            >
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textLight} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Min 6 characters"
                placeholderTextColor={Colors.textLight}
                secureTextEntry={!showPassword}
                autoComplete="password"
                style={{
                  flex: 1,
                  fontFamily: Fonts.regular,
                  fontSize: 15,
                  color: Colors.textPrimary,
                  paddingVertical: 14,
                  paddingLeft: 10,
                }}
              />
              <Pressable
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.textLight}
                />
              </Pressable>
            </View>
          </View>

          {!isRegister && (
            <Pressable style={{ alignSelf: 'flex-end' }}>
              <Text
                style={{
                  fontFamily: Fonts.semiBold,
                  fontSize: 13,
                  color: Colors.primary,
                }}
              >
                Forgot Password?
              </Text>
            </Pressable>
          )}
        </View>

        {/* Signup error */}
        {signUpError && (
          <View
            style={{
              backgroundColor: 'rgba(211,47,47,0.08)',
              borderRadius: 10,
              padding: 12,
              marginTop: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Ionicons name="alert-circle" size={18} color={Colors.error} />
            <Text
              selectable
              style={{
                fontFamily: Fonts.regular,
                fontSize: 13,
                color: Colors.error,
                flex: 1,
              }}
            >
              {signUpError}
            </Text>
          </View>
        )}

        {/* General error (login) */}
        {error && !signUpError && (
          <View
            style={{
              backgroundColor: 'rgba(211,47,47,0.08)',
              borderRadius: 10,
              padding: 12,
              marginTop: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Ionicons name="alert-circle" size={18} color={Colors.error} />
            <Text
              selectable
              style={{
                fontFamily: Fonts.regular,
                fontSize: 13,
                color: Colors.error,
                flex: 1,
              }}
            >
              {formatLoginError(error.message)}
            </Text>
          </View>
        )}

        {/* Submit */}
        <Pressable
          onPress={handleSubmit}
          disabled={isLoading || signUpLoading}
          style={({ pressed }) => ({
            backgroundColor: Colors.primary,
            paddingVertical: 16,
            borderRadius: 14,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 20,
            opacity: (isLoading || signUpLoading) ? 0.7 : pressed ? 0.9 : 1,
          })}
        >
          {(isLoading || signUpLoading) ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text
              style={{
                fontFamily: Fonts.bold,
                fontSize: 16,
                color: Colors.white,
              }}
            >
              {isRegister ? 'Create Account' : 'Login'}
            </Text>
          )}
        </Pressable>

        {/* Divider */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginVertical: 20,
          }}
        >
          <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
          <Text
            style={{
              fontFamily: Fonts.regular,
              fontSize: 13,
              color: Colors.textLight,
            }}
          >
            or
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
        </View>

        {/* Google */}
        <Pressable
          onPress={signInWithGoogle}
          disabled={isLoading || signUpLoading}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            backgroundColor: Colors.card,
            paddingVertical: 14,
            borderRadius: 14,
            borderCurve: 'continuous',
            borderWidth: 1.5,
            borderColor: Colors.border,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Ionicons name="logo-google" size={20} color="#4285F4" />
          <Text
            style={{
              fontFamily: Fonts.semiBold,
              fontSize: 15,
              color: Colors.textPrimary,
            }}
          >
            Continue with Google
          </Text>
        </Pressable>

        {/* Footer */}
        <Pressable
          onPress={toggleMode}
          style={{ marginTop: 24, alignItems: 'center' }}
        >
          <Text
            style={{
              fontFamily: Fonts.regular,
              fontSize: 14,
              color: Colors.textSecondary,
            }}
          >
            {isRegister
              ? 'Already have an account? '
              : "Don't have an account? "}
            <Text
              style={{
                fontFamily: Fonts.bold,
                color: Colors.primary,
              }}
            >
              {isRegister ? 'Login' : 'Register'}
            </Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
