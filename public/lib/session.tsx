import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, setToken, setTenant } from "./api";

export type Business = {
  id: string;
  name: string;
  typeKey: string;
  settings: { currency: string; vatEnabled: boolean; vatRate: number; receiptFooter?: string; modules?: string[] };
  capabilities?: string[];
};
export type Branch = { id: string; businessId: string; name: string };
export type Session = {
  token?: string;
  mode?: "till";
  demo?: boolean;
  platformRole?: "none" | "support" | "overseer";
  user: { id: string; name: string; email: string; phone?: string };
  emailVerified?: boolean;
  phoneVerified?: boolean;
  account: { id: string; name: string; plan: string };
  role: "owner" | "admin" | "manager" | "staff";
  permissions: string[];
  businesses: Business[];
  branches: Branch[];
};

type RegisterInput = {
  name: string; email: string; phone?: string; password: string;
  businessName: string; businessType?: string;
  tradingName?: string; taxId?: string; employees?: number;
  branchName?: string; currency?: string;
};

type Ctx = {
  session: Session | null;
  loading: boolean;
  activeBusiness: Business | null;
  activeBranch: Branch | null;
  branchesForActive: Branch[];
  currency: string;
  setActiveBusiness: (id: string) => void;
  setActiveBranch: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  tillLogin: (businessCode: string, pin: string) => Promise<void>;
  demoLogin: (type?: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  // Re-pulls /auth/me — used after a verify/confirm so the emailVerified /
  // phoneVerified flags (and anything else) update without a full re-login.
  refreshSession: () => Promise<void>;
  logout: () => void;
  can: (perm: string) => boolean;
  hasModule: (module: string) => boolean;
  hasCapability: (capability: string) => boolean;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);

  // Bootstrap from a stored token on first load
  useEffect(() => {
    const stored = localStorage.getItem("startrack.token");
    if (!stored) { setLoading(false); return; }
    api<Session>("/auth/me")
      .then((s) => applySession(s))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  function applySession(s: Session) {
    if (s.token) setToken(s.token);
    setSession(s);
    const biz = s.businesses[0] || null;
    const branch = s.branches.find((b) => b.businessId === biz?.id) || s.branches[0] || null;
    setActiveBusinessId(biz?.id ?? null);
    setActiveBranchId(branch?.id ?? null);
    setTenant(biz?.id ?? null, branch?.id ?? null); // headers ready before pages fetch
  }

  // Keep the API client's tenant headers in lockstep with the switcher.
  useEffect(() => {
    setTenant(activeBusinessId, activeBranchId);
  }, [activeBusinessId, activeBranchId]);

  const value = useMemo<Ctx>(() => {
    const activeBusiness = session?.businesses.find((b) => b.id === activeBusinessId) || null;
    const branchesForActive = session?.branches.filter((b) => b.businessId === activeBusinessId) || [];
    const activeBranch = branchesForActive.find((b) => b.id === activeBranchId) || branchesForActive[0] || null;

    return {
      session,
      loading,
      activeBusiness,
      activeBranch,
      branchesForActive,
      currency: activeBusiness?.settings.currency || "₦",
      setActiveBusiness: (id) => {
        const first = session?.branches.find((b) => b.businessId === id);
        setActiveBusinessId(id);
        setActiveBranchId(first?.id ?? null);
        setTenant(id, first?.id ?? null);
      },
      setActiveBranch: (id) => {
        setActiveBranchId(id);
        setTenant(activeBusinessId, id);
      },
      login: async (email, password) => {
        const s = await api<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        applySession(s);
      },
      tillLogin: async (businessCode, pin) => {
        const s = await api<Session>("/auth/till", { method: "POST", body: JSON.stringify({ businessCode, pin }) });
        applySession(s);
      },
      demoLogin: async (type?: string) => {
        const s = await api<Session>("/auth/demo", { method: "POST", body: JSON.stringify(type ? { type } : {}) });
        applySession(s);
      },
      register: async (input) => {
        const s = await api<Session>("/auth/register", { method: "POST", body: JSON.stringify(input) });
        applySession(s);
      },
      refreshSession: async () => {
        const s = await api<Session>("/auth/me");
        setSession(s);
      },
      logout: () => {
        setToken(null);
        setTenant(null, null);
        setSession(null);
        setActiveBusinessId(null);
        setActiveBranchId(null);
      },
      can: (perm) => !!session && (session.permissions.includes("*") || session.permissions.includes(perm)),
      // Business-level feature switch. Missing list (legacy) = everything on.
      hasModule: (module) => {
        const modules = activeBusiness?.settings.modules;
        return !modules || modules.includes(module);
      },
      // What the TRADE structurally supports. Unlike a module this is not a
      // preference — a supermarket has no job tickets to switch on.
      hasCapability: (capability) => (activeBusiness?.capabilities || []).includes(capability),
    };
  }, [session, loading, activeBusinessId, activeBranchId]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

// Route guard for /app/*
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const location = useLocation();
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-canvas">
        <div className="w-8 h-8 rounded-full border-2 border-line border-t-primary animate-spin" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
