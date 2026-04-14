import type { RecordModel } from 'pocketbase';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { loginWithEmail, logoutUser, pb, restoreAuth, signUpWithEmail } from '@/pocketbase';

function getPbUser(): RecordModel | null {
  return ((pb.authStore as { record?: RecordModel | null }).record ?? pb.authStore.model) as RecordModel | null;
}

type PatientAuthContextValue = {
  ready: boolean;
  user: RecordModel | null;
  isPatient: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUpPatient: (input: { name: string; email: string; password: string }) => Promise<void>;
  signOut: () => void;
};

const PatientAuthContext = createContext<PatientAuthContextValue | null>(null);

export function PatientAuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<RecordModel | null>(() => getPbUser());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await restoreAuth();
      if (!cancelled) {
        setUser(getPbUser());
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsub = pb.authStore.onChange(() => {
      setUser(getPbUser());
    });
    return () => {
      unsub();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await loginWithEmail({ email: email.trim(), password });
    setUser(getPbUser());
  }, []);

  const signUpPatient = useCallback(async (input: { name: string; email: string; password: string }) => {
    await signUpWithEmail({
      name: input.name,
      email: input.email.trim(),
      password: input.password,
      role: 'patient',
    });
    setUser(getPbUser());
  }, []);

  const signOut = useCallback(() => {
    logoutUser();
    setUser(null);
  }, []);

  const value = useMemo<PatientAuthContextValue>(
    () => ({
      ready,
      user,
      isPatient: user?.role === 'patient',
      signIn,
      signUpPatient,
      signOut,
    }),
    [ready, user, signIn, signUpPatient, signOut],
  );

  return <PatientAuthContext.Provider value={value}>{children}</PatientAuthContext.Provider>;
}

export function usePatientAuth() {
  const ctx = useContext(PatientAuthContext);
  if (!ctx) {
    throw new Error('usePatientAuth must be used within PatientAuthProvider');
  }
  return ctx;
}
