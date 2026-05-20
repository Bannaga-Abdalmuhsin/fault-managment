import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import FaultManagement from "@/pages/FaultManagement";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchInterval: 60_000 } },
});

async function verifyToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

type Page = "dashboard" | "faults";

export default function App() {
  const [authState, setAuthState] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [page, setPage] = useState<Page>("dashboard");

  useEffect(() => {
    const token = sessionStorage.getItem("cow_token");
    if (!token) { setAuthState("unauthenticated"); return; }
    verifyToken(token).then(ok =>
      setAuthState(ok ? "authenticated" : "unauthenticated")
    );
  }, []);

  if (authState === "loading") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(135deg, #14002A 0%, #280050 40%, #14002A 100%)",
      }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%",
          border: "3px solid rgba(200,140,255,0.2)", borderTopColor: "#C792FF",
          animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return <Login onSuccess={() => setAuthState("authenticated")} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      {page === "faults"
        ? <FaultManagement onBack={() => setPage("dashboard")} />
        : <Dashboard onNavigate={(p: Page) => setPage(p)} />
      }
    </QueryClientProvider>
  );
}
