'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getCurrentAppUser, invalidateCurrentUserCache } from '@/lib/users/client';
import type { AppUserProfile, UserGroup, UserRole } from '@/lib/users/types';
import { toast } from 'sonner';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 Minutes
const THROTTLE_INTERVAL_MS = 10000; // Update activity at most once every 10s

export interface UserSessionContextType {
  user: User | null;
  profile: AppUserProfile | null;
  group: UserGroup;
  role: UserRole;
  workCenter: string;
  allowedStages: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  refreshUser: (force?: boolean) => Promise<void>;
}

export const UserSessionContext = createContext<UserSessionContextType | null>(null);

export function UserSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const lastActivityRef = useRef<number>(Date.now());
  const isAuthPage = pathname === '/login';

  // 1. Initial and dynamic session loader
  const refreshUser = useCallback(async (force = false) => {
    try {
      if (force) invalidateCurrentUserCache();
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();

      if (!authData?.user) {
        setUser(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      setUser(authData.user);
      const appProfile = await getCurrentAppUser(force);
      setProfile(appProfile);
    } catch (err) {
      console.error('Failed to load user session:', err);
      setUser(null);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 2. Subscribe to Supabase auth state changes
  useEffect(() => {
    void refreshUser();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        invalidateCurrentUserCache();
        setIsLoading(false);
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setUser(session.user);
          const appProfile = await getCurrentAppUser(true);
          setProfile(appProfile);
        }
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshUser]);

  // 3. Clean Sign Out
  const signOut = useCallback(async () => {
    try {
      const supabase = createClient();
      if (user) {
        await supabase.from('audit_log').insert({
          user_id: user.id,
          action: 'AUTH_LOGOUT',
          entity: 'User Session',
          record_id: user.id,
          new_value: {
            email: user.email,
            name: profile?.name,
            timestamp: new Date().toISOString(),
          },
        });
      }
      await supabase.auth.signOut();
    } catch {
      // Continue cleanup regardless
    } finally {
      setUser(null);
      setProfile(null);
      invalidateCurrentUserCache();
      router.replace('/login');
      router.refresh();
      toast.info('Signed out successfully.');
    }
  }, [user, profile, router]);

  // 4. Session Expiration after 15 Minutes Idle Inactivity
  const handleSessionTimeout = useCallback(async () => {
    try {
      const supabase = createClient();
      if (user) {
        void supabase.from('audit_log').insert({
          user_id: user.id,
          action: 'AUTH_SESSION_EXPIRED',
          entity: 'User Session',
          record_id: user.id,
          new_value: {
            reason: '15_min_idle_timeout',
            email: user.email,
            name: profile?.name,
            timestamp: new Date().toISOString(),
          },
        });
      }
      await supabase.auth.signOut();
    } catch {
      // Continue cleanup
    } finally {
      setUser(null);
      setProfile(null);
      invalidateCurrentUserCache();
      router.replace('/login');
      router.refresh();
      toast.info('Your session expired due to 15 minutes of inactivity. Please sign in again.');
    }
  }, [user, profile, router]);

  // 5. Inactivity Tracker
  useEffect(() => {
    if (isAuthPage || !user) return;

    let lastRecord = Date.now();
    lastActivityRef.current = Date.now();

    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastRecord > THROTTLE_INTERVAL_MS) {
        lastActivityRef.current = now;
        lastRecord = now;
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      if (elapsed >= IDLE_TIMEOUT_MS) {
        clearInterval(intervalId);
        void handleSessionTimeout();
      }
    }, 15000); // Check every 15s

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
      clearInterval(intervalId);
    };
  }, [isAuthPage, user, handleSessionTimeout]);

  const value = useMemo(() => {
    const group: UserGroup = profile?.group || (profile?.role === 'admin' ? 'admin' : profile?.role === 'manager' ? 'super_user' : 'user');
    const role: UserRole = profile?.role || 'rolling_incharge';
    const workCenter: string = profile?.work_center || 'ALL';
    const allowedStages: string[] = profile?.allowed_stages || [];

    return {
      user,
      profile,
      group,
      role,
      workCenter,
      allowedStages,
      isLoading,
      isAuthenticated: !!user,
      signOut,
      refreshUser,
    };
  }, [
    user,
    profile,
    isLoading,
    signOut,
    refreshUser,
  ]);

  return <UserSessionContext.Provider value={value}>{children}</UserSessionContext.Provider>;
}

export function useUserSession(): UserSessionContextType {
  const context = useContext(UserSessionContext);
  if (!context) {
    throw new Error('useUserSession must be used within a UserSessionProvider');
  }
  return context;
}

export function useOptionalUserSession(): UserSessionContextType | null {
  return useContext(UserSessionContext);
}
