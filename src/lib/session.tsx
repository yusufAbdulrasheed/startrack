import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, setToken } from "./api";

export type Business = { id: string; name: string; typeKey: string; settings: { currency: string; vatEnabled: boolean; vatRate: number } };
export type Branch = { id: string; businessId: string; name: string };
export type Session = {
  token?: string;
  user: { id: string; name: string; email: string };
  account: { id: string; name: string; plan: string };
  role: "owner" | "admin" | "manager" | "staff";
  permissions: string[];
  businesses: Business[];
  branches: Branch[];
};

type RegisterInput = {
  name: string; email: string; password: string;
  businessName: string; businessType: string; currency?: string; branchName?: string;
};

type Ctx = {
  session: Session | null;
  loading: boolean;
  activeBusiness: Business | null;
  activeBranch: Branch | null;
  branchesForActive: Branch[];
  setActiveBusiness: (id: string) => void;
  setActiveBranch: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  can: (perm: string) => boolean;
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
    setActiveBusinessId(biz?.id ?? null);
    const branch = s.branches.find((b) => b.businessId === biz?.id) || s.branches[0] || null;
    setActiveBranchId(branch?.id ?? null);
  }

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
      setActiveBusiness: (id) => {
        setActiveBusinessId(id);
        const first = session?.branches.find((b) => b.businessId === id);
        setActiveBranchId(first?.id ?? null);
      },
      setActiveBranch: (id) => setActiveBranchId(id),
      login: async (email, password) => {
        const s = await api<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        applySession(s);
      },
      register: async (input) => {
        const s = await api<Session>("/auth/register", { method: "POST", body: JSON.stringify(input) });
        applySession(s);
      },
      logout: () => {
        setToken(null);
        setSession(null);
        setActiveBusinessId(null);
        setActiveBranchId(null);
      },
      can: (perm) => !!session && (session.permissions.includes("*") || session.permissions.includes(perm)),
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
