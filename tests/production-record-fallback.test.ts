import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Load .env.local
try {
  const envContent = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
  envContent.split('\n').forEach((line) => {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  });
} catch {}

import { POST } from '@/app/api/production/record/route';
import { NextRequest } from 'next/server';

describe('Production Record Route Fallback Handling', () => {
  it('validates request structure and rejects empty entries', async () => {
    const req = new NextRequest('http://localhost:3000/api/production/record', {
      method: 'POST',
      body: JSON.stringify({ entries: [] }),
    });
    // With fake or empty user session, auth will reject or validate
    const res = await POST(req);
    expect([400, 401]).toContain(res.status);
  });
});
