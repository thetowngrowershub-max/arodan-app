import { mockBackend } from './mock';
import { supabaseBackend } from './supabase';
import type { Backend } from './types';

/**
 * Uses the real Supabase backend when EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set
 * (see customer-app/.env.example), otherwise the offline demo.
 */
export const backend: Backend = supabaseBackend ?? mockBackend;
