import { Link, useLocation } from "wouter";
import { Activity, LayoutDashboard, MapPin, RadioTower, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Sites", href: "/sites", icon: RadioTower },
    { name: "Tickets", href: "/tickets", icon: AlertTriangle },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-mono text-sm">
      <nav className="w-full md:w-64 bg-card border-r border-border md:min-h-screen flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-foreground tracking-tight">COW-OPS</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Hajj Monitoring</p>
          </div>
        </div>

        <div className="flex-1 py-4 flex flex-col gap-1 px-2">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors group",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {item.name}
              </Link>
            );
          })}
        </div>
        
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            System Operational
          </div>
        </div>
      </nav>

      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
