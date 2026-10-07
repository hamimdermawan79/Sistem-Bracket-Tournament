import { createClient } from '@supabase/supabase-js';
import { localClient } from './localClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pjbhmlzhzchffqqtyroe.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqYmhtbHpoemNoZmZxcXR5cm9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MTYwMjcsImV4cCI6MjEwMjM5MjAyN30.BTFworXMatnEHIxZqtrL3rP9OBmBctHygcgCWY6sph4';

const remoteClient = createClient(supabaseUrl, supabaseAnonKey);
export const supabase = process.env.NEXT_PUBLIC_LOCAL_TOURNAMENT === 'true'
  ? localClient as unknown as typeof remoteClient
  : remoteClient;
