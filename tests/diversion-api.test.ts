import { describe, it, expect } from 'vitest';
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

import { GET, POST, PUT } from '@/app/api/diversions/route';
import { createAdminClient } from '@/lib/supabase/admin';

describe('Diversion API Route (/api/diversions)', () => {
  const supabase = createAdminClient();

  it('validates required fields on POST', async () => {
    const req = new Request('http://localhost:3000/api/diversions', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('blocks source and target work order being identical', async () => {
    const req = new Request('http://localhost:3000/api/diversions', {
      method: 'POST',
      body: JSON.stringify({
        source_wo_id: '11111111-1111-1111-1111-111111111111',
        target_wo_id: '11111111-1111-1111-1111-111111111111',
        diverted_qty: 10,
      }),
    });
    const res = await POST(req as any);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain('Source and target work order cannot be the same');
  });

  it('fetches existing diversions via GET with filter params', async () => {
    const req = new Request('http://localhost:3000/api/diversions?limit=5');
    const res = await GET(req as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(json.data)).toBe(true);
  });
});
