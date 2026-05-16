import { useRouter } from 'expo-router';
import { AuthCallbackPage } from '@fastshot/auth';
import { supabase } from '@/lib/supabase';

/**
 * Auth callback handler for web.
 * Handles OAuth sign-in callbacks (Google, etc).
 */
export default function Callback() {
  const router = useRouter();

  return (
    <AuthCallbackPage
      supabaseClient={supabase}
      onSuccess={async () => {
        // OAuth sign-in — go straight to app
        router.replace('/(tabs)');
      }}
      onError={(error) => {
        router.replace(
          `/(auth)/login?error=${encodeURIComponent(error.message)}`
        );
      }}
      loadingText="Completing sign in..."
    />
  );
}
