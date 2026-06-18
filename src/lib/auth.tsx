import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { findEmailByCpf } from "@/lib/staff.functions";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isMaster: boolean;
  isViewer: boolean;
  isMechanic: boolean;
  roles: string[];
  modules: string[];
  loading: boolean;
  reloadModules: () => Promise<void>;
  signIn: (cpf: string, password: string) => Promise<{ error?: string }>;
  signInEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signInUnified: (cpfOrEmail: string, password: string) => Promise<{ error?: string }>;
  signUp: (fullName: string, cpf: string, cnh: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRoles = async (uid: string | null) => {
      if (!uid) { setRoles([]); setModules([]); setIsAdmin(false); setIsMaster(false); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const rs = (data ?? []).map((r) => r.role as string);
      setRoles(rs);
      const admin = rs.includes("admin") || rs.includes("master");
      setIsAdmin(admin);
      setIsMaster(rs.includes("master"));
      // Only ERP roles (admin/master/viewer) have module assignments.
      // Cast to any because user_module_access is not yet in generated Supabase types.
      if (admin || rs.includes("viewer")) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: mods, error: modErr } = await (supabase as any).from("user_module_access").select("module_slug").eq("user_id", uid);
        if (modErr) console.error("[auth] user_module_access query failed:", modErr.message);
        setModules(((mods as Array<{ module_slug: string }>) ?? []).map((m) => m.module_slug));
      } else {
        setModules([]);
      }
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setTimeout(() => { loadRoles(s?.user?.id ?? null); }, 0);
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      await loadRoles(data.session?.user?.id ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const cpfToEmail = (cpf: string) => `${cpf.replace(/\D/g, "")}@frota.local`;
  const signIn = async (cpf: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: cpfToEmail(cpf), password });
    return { error: error?.message };
  };
  const signInEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  };
  const signInUnified = async (cpfOrEmail: string, password: string) => {
    const trimmed = cpfOrEmail.trim();
    const digits = trimmed.replace(/\D/g, "");
    const isCpf = !trimmed.includes("@") && digits.length === 11;

    if (isCpf) {
      // Look up the real email via server function (supabaseAdmin, no auth required)
      let email = `${digits}@frota.local`; // legacy driver fallback
      try {
        const result = await findEmailByCpf({ data: { cpf: trimmed } });
        if (result?.email) email = result.email;
      } catch {
        // server function unavailable — proceed with fallback
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message };
    }

    const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
    return { error: error?.message };
  };
  const signUp = async (fullName: string, cpf: string, cnh: string, password: string) => {
    const cleanCpf = cpf.replace(/\D/g, "");
    const cleanCnh = cnh.replace(/\D/g, "");
    const { data, error } = await supabase.auth.signUp({
      email: cpfToEmail(cleanCpf), password,
      options: { data: { full_name: fullName, cpf: cleanCpf, cnh: cleanCnh }, emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) return { error: error.message };
    if (data.user) {
      await supabase.from("profiles").update({ full_name: fullName, cpf: cleanCpf, cnh: cleanCnh }).eq("id", data.user.id);
    }
    return {};
  };
  const signOut = async () => { await supabase.auth.signOut(); };

  const reloadModules = async () => {
    const uid = user?.id;
    if (!uid) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mods, error: modErr } = await (supabase as any).from("user_module_access").select("module_slug").eq("user_id", uid);
    if (modErr) console.error("[auth] reloadModules failed:", modErr.message);
    setModules(((mods as Array<{ module_slug: string }>) ?? []).map((m) => m.module_slug));
  };

  const isViewer = roles.includes("viewer");
  const isMechanic = roles.includes("mechanic");
  return <Ctx.Provider value={{ user, session, isAdmin, isMaster, isViewer, isMechanic, roles, modules, loading, reloadModules, signIn, signInEmail, signInUnified, signUp, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
};