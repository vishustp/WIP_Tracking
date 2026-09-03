import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function getServiceRoleKey(): string {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  }
  if (process.env.SUPABASE_SERVICE_KEY?.trim()) {
    return process.env.SUPABASE_SERVICE_KEY.trim();
  }
  if (process.env.SUPABASE_SECRET_KEY?.trim()) {
    return process.env.SUPABASE_SECRET_KEY.trim();
  }

  // Fallback: try reading /app/.dev.env.json or local env files
  const devJsonPaths = [
    '/app/.dev.env.json',
    path.resolve(process.cwd(), '../.dev.env.json'),
    path.resolve(process.cwd(), '.dev.env.json'),
  ];
  for (const p of devJsonPaths) {
    try {
      if (fs.existsSync(p)) {
        const content = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (content.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
          return String(content.SUPABASE_SERVICE_ROLE_KEY).trim();
        }
      }
    } catch {
      // Continue to next path
    }
  }

  return '';
}

function getSupabaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    return process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
  }
  const devJsonPaths = [
    '/app/.dev.env.json',
    path.resolve(process.cwd(), '../.dev.env.json'),
    path.resolve(process.cwd(), '.dev.env.json'),
  ];
  for (const p of devJsonPaths) {
    try {
      if (fs.existsSync(p)) {
        const content = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (content.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
          return String(content.NEXT_PUBLIC_SUPABASE_URL).trim();
        }
      }
    } catch {}
  }
  return '';
}

let cachedAdminClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient | null {
  if (cachedAdminClient) return cachedAdminClient;

  const url = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey || !url.startsWith('http')) {
    return null;
  }

  try {
    cachedAdminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    return cachedAdminClient;
  } catch (err) {
    console.error('Failed to create Supabase admin client:', err);
    return null;
  }
}


