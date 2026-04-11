'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Role } from '@/lib/constants/roles';

interface AuthUser {
  user: User | null;
  role: Role | null;
  fullName: string | null;
  loading: boolean;
}

export function useAuth(): AuthUser {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        // Fetch profile with role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', user.id)
          .single();

        if (profile) {
          setRole(profile.role as Role);
          setFullName(profile.full_name);
        }
      }

      setLoading(false);
    }

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setRole(null);
        setFullName(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, role, fullName, loading };
}
