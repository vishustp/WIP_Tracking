import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function readEnvVarFromFile(varName: string): string {
  const possiblePaths = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.production'),
    path.resolve(process.cwd(), '.env.development'),
    path.resolve(process.cwd(), '../.env.local'),
    path.resolve(process.cwd(), '../.env'),
    '/app/.dev.env.json',
    path.resolve(process.cwd(), '../.dev.env.json'),
    path.resolve(process.cwd(), '.dev.env.json'),
  ];

  for (const filePath of possiblePaths) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check if JSON
      if (filePath.endsWith('.json')) {
        const parsed = JSON.parse(content);
        if (parsed[varName]?.trim()) {
          return String(parsed[varName]).trim();
        }
        continue;
      }

      // Parse standard .env format
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.substring(0, eqIdx).trim();
          if (key === varName) {
            let val = trimmed.substring(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (val) return val;
          }
        }
      }
    } catch {
      // Continue searching
    }
  }

  return '';
}

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

  return (
    readEnvVarFromFile('SUPABASE_SERVICE_ROLE_KEY') ||
    readEnvVarFromFile('SUPABASE_SERVICE_KEY') ||
    readEnvVarFromFile('SUPABASE_SECRET_KEY')
  );
}

function getSupabaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    return process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
  }
  if (process.env.SUPABASE_URL?.trim()) {
    return process.env.SUPABASE_URL.trim();
  }

  return (
    readEnvVarFromFile('NEXT_PUBLIC_SUPABASE_URL') ||
    readEnvVarFromFile('SUPABASE_URL')
  );
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


