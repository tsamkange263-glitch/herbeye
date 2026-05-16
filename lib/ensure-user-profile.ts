import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/types';

const DEFAULT_SCAN_CREDITS = 3;
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 600;

/**
 * Ensures a user profile row exists in the public.users table.
 *
 * IMPORTANT: This should only be called when the user has an active session,
 * because the RLS policy on `public.users` requires `auth.uid() = id`.
 *
 * The DB trigger `on_auth_user_created` normally creates the profile row,
 * but there can be a race condition where the app tries to read the profile
 * before the trigger completes. This function handles that by retrying,
 * and if the profile still doesn't exist after retries, it creates one.
 */
export async function ensureUserProfile(
  userId: string,
  options?: {
    email?: string | null;
    fullName?: string | null;
  }
): Promise<Tables<'users'> | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Try to fetch the existing profile
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) return data;

    // If we got an error other than "no rows found", it's a real error
    if (error && error.code !== 'PGRST116') {
      console.warn('[ensure-user-profile] Error fetching profile:', error.message);
      // Don't break immediately - the session might still be propagating
    }

    // On first failed attempt, try to create the profile via upsert
    if (attempt === 0) {
      const { data: upsertData, error: upsertError } = await supabase
        .from('users')
        .upsert(
          {
            id: userId,
            email: options?.email || null,
            full_name: options?.fullName || null,
            scan_credits: DEFAULT_SCAN_CREDITS,
          },
          { onConflict: 'id' }
        )
        .select('*')
        .single();

      if (upsertData) return upsertData;

      if (upsertError) {
        // Upsert can fail if trigger already created the row (timing)
        // or if session isn't fully propagated yet. Retry fetch.
        console.warn('[ensure-user-profile] Upsert attempt:', upsertError.message);
      }
    }

    // Wait before retrying — the trigger may still be running
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  // Final fallback: try one more upsert after all retries
  const { data: finalData } = await supabase
    .from('users')
    .upsert(
      {
        id: userId,
        email: options?.email || null,
        full_name: options?.fullName || null,
        scan_credits: DEFAULT_SCAN_CREDITS,
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single();

  if (finalData) return finalData;

  // If all attempts failed, return null — the app should still work
  // and will try again on next screen load
  console.warn('[ensure-user-profile] All attempts failed for user:', userId);
  return null;
}

/**
 * Fetches a user profile, creating it if it doesn't exist.
 * This is a convenience wrapper for use in authenticated screens.
 */
export async function fetchOrCreateProfile(
  userId: string,
  email?: string | null,
  fullName?: string | null
): Promise<Tables<'users'> | null> {
  return ensureUserProfile(userId, { email, fullName });
}
