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

import { isAuthorizedForStation } from '@/lib/supabase/authGuard';
import type { AuthContext } from '@/lib/supabase/authGuard';
import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';

describe('Phase 5: Security Hardening & Edge Middleware RBAC', () => {
  describe('isAuthorizedForStation', () => {
    it('grants access to Admin across all stations', () => {
      const adminAuth: AuthContext = {
        user: { id: 'admin-1', email: 'admin@rashmi.com' } as any,
        isAdmin: true,
      };
      expect(isAuthorizedForStation(adminAuth, 'HOT_ROLLING')).toBe(true);
      expect(isAuthorizedForStation(adminAuth, 'DRAW')).toBe(true);
      expect(isAuthorizedForStation(adminAuth, 'BAND_SAW')).toBe(true);
      expect(isAuthorizedForStation(adminAuth, 'FINISHING')).toBe(true);
    });

    it('grants access to Super User across all stations', () => {
      const superUserAuth: AuthContext = {
        user: { id: 'su-1', email: 'ppc@rashmi.com' } as any,
        isAdmin: false,
        appUser: { role: 'super_user', user_group: 'super_user' },
      };
      expect(isAuthorizedForStation(superUserAuth, 'HOT_ROLLING')).toBe(true);
      expect(isAuthorizedForStation(superUserAuth, 'DRAW')).toBe(true);
      expect(isAuthorizedForStation(superUserAuth, 'FINISHING')).toBe(true);
    });

    it('grants access when work_center is ALL', () => {
      const globalAuth: AuthContext = {
        user: { id: 'op-all', email: 'op@rashmi.com' } as any,
        isAdmin: false,
        appUser: { role: 'operator', user_group: 'user', work_center: 'ALL' },
      };
      expect(isAuthorizedForStation(globalAuth, 'DRAW')).toBe(true);
      expect(isAuthorizedForStation(globalAuth, 'VDI')).toBe(true);
    });

    it('restricts Draw operator to DRAW stage only', () => {
      const drawAuth: AuthContext = {
        user: { id: 'op-draw', email: 'draw@rashmi.com' } as any,
        isAdmin: false,
        appUser: { role: 'operator', user_group: 'user', work_center: 'DRAW' },
      };
      expect(isAuthorizedForStation(drawAuth, 'DRAW')).toBe(true);
      expect(isAuthorizedForStation(drawAuth, 'HOT_ROLLING')).toBe(false);
      expect(isAuthorizedForStation(drawAuth, 'BAND_SAW')).toBe(false);
    });

    it('strictly enforces Rule 8: Joint Band Saw & Finishing operational authority', () => {
      const bandSawAuth: AuthContext = {
        user: { id: 'op-bs', email: 'bs@rashmi.com' } as any,
        isAdmin: false,
        appUser: { role: 'operator', user_group: 'user', work_center: 'BAND_SAW' },
      };
      // Band saw operator can record at Band Saw AND Finishing
      expect(isAuthorizedForStation(bandSawAuth, 'BAND_SAW')).toBe(true);
      expect(isAuthorizedForStation(bandSawAuth, 'FINISHING')).toBe(true);
      expect(isAuthorizedForStation(bandSawAuth, 'DRAW')).toBe(false);

      const finishingAuth: AuthContext = {
        user: { id: 'op-fin', email: 'fin@rashmi.com' } as any,
        isAdmin: false,
        appUser: { role: 'operator', user_group: 'user', work_center: 'FINISHING' },
      };
      // Finishing operator can record at Finishing AND Band Saw
      expect(isAuthorizedForStation(finishingAuth, 'FINISHING')).toBe(true);
      expect(isAuthorizedForStation(finishingAuth, 'BAND_SAW')).toBe(true);
      expect(isAuthorizedForStation(finishingAuth, 'HEAT_TREATMENT')).toBe(false);
    });

    it('strictly enforces Rule 8: Joint Furnace operational authority', () => {
      const hollowHtAuth: AuthContext = {
        user: { id: 'op-hht', email: 'hht@rashmi.com' } as any,
        isAdmin: false,
        appUser: { role: 'operator', user_group: 'user', work_center: 'HOLLOW_HEAT_TREATMENT' },
      };
      // Hollow HT operator can record at Hollow HT AND Final HT
      expect(isAuthorizedForStation(hollowHtAuth, 'HOLLOW_HEAT_TREATMENT')).toBe(true);
      expect(isAuthorizedForStation(hollowHtAuth, 'HEAT_TREATMENT')).toBe(true);
      expect(isAuthorizedForStation(hollowHtAuth, 'DRAW')).toBe(false);
    });

    it('honors granular Admin custom permissions override', () => {
      const customAuth: AuthContext = {
        user: { id: 'op-custom', email: 'custom@rashmi.com' } as any,
        isAdmin: false,
        appUser: {
          role: 'operator',
          user_group: 'user',
          work_center: 'DRAW',
          permissions: {
            production_htc: 'edit',
            production_draw: 'edit',
          },
        },
      };
      expect(isAuthorizedForStation(customAuth, 'HTC')).toBe(true);
      expect(isAuthorizedForStation(customAuth, 'DRAW')).toBe(true);
      expect(isAuthorizedForStation(customAuth, 'HOT_ROLLING')).toBe(false);
    });
  });

  describe('Edge Middleware Security Guard', () => {
    it('allows unauthenticated access to public path /login', async () => {
      const req = new NextRequest('http://localhost:3000/login');
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it('blocks unauthenticated API mutations with 401 JSON instead of redirect', async () => {
      // POST
      const postReq = new NextRequest('http://localhost:3000/api/production/record', {
        method: 'POST',
      });
      const postRes = await middleware(postReq);
      expect(postRes.status).toBe(401);
      const postJson = await postRes.json();
      expect(postJson.error).toContain('Unauthorized');

      // DELETE
      const deleteReq = new NextRequest('http://localhost:3000/api/production/delete?id=test-123', {
        method: 'DELETE',
      });
      const deleteRes = await middleware(deleteReq);
      expect(deleteRes.status).toBe(401);

      // PUT
      const putReq = new NextRequest('http://localhost:3000/api/diversions', {
        method: 'PUT',
      });
      const putRes = await middleware(putReq);
      expect(putRes.status).toBe(401);
    });

    it('permits read-only GET requests on non-admin API routes to pass through to route handler', async () => {
      const getReq = new NextRequest('http://localhost:3000/api/production/queue');
      const getRes = await middleware(getReq);
      // Returns 200 pass-through response (NextResponse.next())
      expect(getRes.status).toBe(200);
    });

    it('blocks unauthenticated access to /api/admin with 401 JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/reset-factory', {
        method: 'GET',
      });
      const res = await middleware(req);
      expect(res.status).toBe(401);
    });

    it('redirects unauthenticated page access to /login', async () => {
      const req = new NextRequest('http://localhost:3000/dashboard', {
        method: 'GET',
      });
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    });
  });
});
