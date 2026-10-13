"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "../utils/supabaseClient";
import { notifyStorageChange } from "../utils/browserStorage";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, error: null });

function syncLegacySession(user: User | null) {
  if (!user) {
    localStorage.removeItem("sw_session");
    notifyStorageChange("sw_session");
    return;
  }

  let previous: { id?: string; email?: string; name?: string } = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem("sw_session") || "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) previous = parsed as typeof previous;
  } catch {
    // Replace an unreadable session cache with the authenticated Supabase user.
  }

  const metadataName = user.user_metadata?.name;
  const sameUser = previous.id === user.id || previous.email?.toLowerCase() === user.email?.toLowerCase();
  const name = sameUser && previous.name?.trim()
    ? previous.name.trim()
    : typeof metadataName === "string" ? metadataName.trim() : "";
  localStorage.setItem("sw_session", JSON.stringify({ ...previous, id: user.id, email: user.email ?? "", name }));
  notifyStorageChange("sw_session");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let client;
    try {
      client = getSupabaseClient();
    } catch (cause) {
      queueMicrotask(() => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Supabase is not configured.");
        setLoading(false);
      });
      return;
    }

    client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setUser(data.session?.user ?? null);
      syncLegacySession(data.session?.user ?? null);
      setLoading(false);
    }).catch(cause => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Could not restore the sign-in session.");
      setUser(null);
      setLoading(false);
    });

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser || event !== "INITIAL_SESSION") syncLegacySession(nextUser);
      setLoading(false);
      setError(null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ user, loading, error }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
