/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { UserSessionProvider, useUserSession } from '../contexts/UserSessionContext';

// Mock router and pathname
let currentPath = '/production';
const mockReplace = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => currentPath,
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    refresh: mockRefresh,
  }),
}));

// Mock Supabase client
const mockGetUser = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockOnAuthStateChange = vi.fn().mockReturnValue({
  data: { subscription: { unsubscribe: vi.fn() } },
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

// Mock getCurrentAppUser
vi.mock('@/lib/users/client', () => ({
  getCurrentAppUser: vi.fn().mockResolvedValue({
    id: 'emp-101',
    auth_user_id: 'auth-101',
    email: 'operator.draw@rashmiseamless.com',
    name: 'Rajesh Sharma',
    employee_id: 'EMP-101',
    group: 'user',
    role: 'draw_operator',
    role_title: 'Cold Draw Operator',
    work_center: 'DRAW',
    department: 'Cold Draw Bench & Pilgering',
    shift: 'Shift A',
    allowed_stages: ['DRAW'],
    default_stage: 'DRAW',
    active: true,
  }),
  invalidateCurrentUserCache: vi.fn(),
}));

// Test helper component
function TestConsumer() {
  const session = useUserSession();
  return (
    <div>
      <div data-testid="operator-name">{session.profile?.name || 'No Operator'}</div>
      <div data-testid="is-loading">{session.isLoading ? 'LOADING' : 'READY'}</div>
      <div data-testid="is-authenticated">{session.isAuthenticated ? 'YES' : 'NO'}</div>
      <div data-testid="work-center">{session.workCenter}</div>
      <button data-testid="sign-out-btn" onClick={session.signOut}>
        Sign Out
      </button>
    </div>
  );
}

describe('User Session & Inactivity Expiration Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    currentPath = '/production';
    mockGetUser.mockResolvedValue({
      data: {
        user: { id: 'auth-101', email: 'operator.draw@rashmiseamless.com' },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('initializes session context with active user profile and sets isAuthenticated', async () => {
    render(
      <UserSessionProvider>
        <TestConsumer />
      </UserSessionProvider>
    );

    // Initial loading check
    expect(screen.getByTestId('is-loading').textContent).toBe('LOADING');

    // Wait for auth & profile resolution
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('is-loading').textContent).toBe('READY');
    expect(screen.getByTestId('operator-name').textContent).toBe('Rajesh Sharma');
    expect(screen.getByTestId('is-authenticated').textContent).toBe('YES');
    expect(screen.getByTestId('work-center').textContent).toBe('DRAW');
  });

  it('signs out and redirects to /login on manual logout', async () => {
    mockSignOut.mockResolvedValue({ error: null });

    render(
      <UserSessionProvider>
        <TestConsumer />
      </UserSessionProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('sign-out-btn'));
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('automatically expires login session after 15 minutes of inactivity', async () => {
    vi.useFakeTimers();
    mockSignOut.mockResolvedValue({ error: null });

    render(
      <UserSessionProvider>
        <TestConsumer />
      </UserSessionProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('is-authenticated').textContent).toBe('YES');

    // Advance timers by 15 minutes + 15s interval check
    await act(async () => {
      vi.advanceTimersByTime(15 * 60 * 1000 + 15000);
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/login');

    vi.useRealTimers();
  });
});
