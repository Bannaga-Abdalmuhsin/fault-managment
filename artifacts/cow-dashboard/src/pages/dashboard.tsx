import { useGetDashboardSummary, useGetOutagesByDay, useGetOutagesByType, useGetSiteStatus, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioTower, AlertTriangle, Activity, Zap, CheckCircle2, XCircle, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: outagesByDay, isLoading: loadingOutages } = useGetOutagesByDay();
  const { data: outagesByType, isLoading: loadingType } = useGetOutagesByType();
  const { data: siteStatus, isLoading: loadingStatus } = useGetSiteStatus();
  const { data: recentActivity, isLoading: loadingActivity } = useGetRecentActivity();

  if (loadingSummary || loadingOutages || loadingType || loadingStatus || loadingActivity) {
    return <DashboardSkeleton />;
  }

  if (!summary) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Global Operations Command</h1>
          <p className="text-muted-foreground text-sm">Real-time status overview of all deployed COW sites.</p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-md text-xs font-mono">
          <span className="text-muted-foreground">LAST UPDATED</span>
          <span className="text-primary">{format(new Date(), "HH:mm:ss")}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <KpiCard title="Total Sites" value={summary.totalSites} icon={RadioTower} />
        <KpiCard title="Operational" value={summary.operationalSites} icon={CheckCircle2} valueClass="text-green-500" />
        <KpiCard title="Degraded" value={summary.degradedSites} icon={Activity} valueClass="text-amber-500" />
        <KpiCard title="Offline" value={summary.offlineSites} icon={XCircle} valueClass="text-red-500" />
        <KpiCard title="Open Tickets" value={summary.openTickets} icon={AlertTriangle} />
        <KpiCard title="Critical" value={summary.criticalTickets} icon={Zap} valueClass="text-red-500" />
        <KpiCard title="Avg Resolution" value={`${summary.avgResolutionHours}h`} icon={Clock} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-card/50 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Outage Trends (7 Days)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {outagesByDay && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={outagesByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="date" stroke="#ffffff40" fontSize={12} tickFormatter={(val) => format(parseISO(val), "MMM dd")} />
                  <YAxis stroke="#ffffff40" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                    itemStyle={{ color: '#f8fafc' }}
                    labelFormatter={(val) => format(parseISO(val as string), "MMM dd, yyyy")}
                  />
                  <Bar dataKey="powerOutages" name="Power" stackId="a" fill="#f59e0b" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="telecomOutages" name="Telecom" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Outage Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center">
            {outagesByType && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={outagesByType}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="type"
                  >
                    {outagesByType.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.type === 'power' ? '#f59e0b' : '#3b82f6'} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="absolute flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold text-foreground">{summary.powerOutageTickets + summary.telecomOutageTickets}</span>
              <span className="text-[10px] text-muted-foreground uppercase">Total Issues</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex justify-between">
              <span>Site Status Matrix</span>
              <span className="text-foreground">{siteStatus?.length || 0} Nodes</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {siteStatus?.map((site) => (
                <div 
                  key={site.siteId}
                  className={cn(
                    "p-3 rounded border flex flex-col gap-2 relative overflow-hidden",
                    site.status === "offline" ? "bg-red-500/10 border-red-500/30" :
                    site.status === "degraded" ? "bg-amber-500/10 border-amber-500/30" :
                    "bg-green-500/5 border-green-500/20"
                  )}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-foreground text-xs truncate max-w-[80px]" title={site.siteName}>{site.siteName}</span>
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      site.status === "offline" ? "bg-red-500 animate-pulse" :
                      site.status === "degraded" ? "bg-amber-500" :
                      "bg-green-500"
                    )} />
                  </div>
                  <div className="text-[10px] text-muted-foreground">{site.zone}</div>
                  {site.openTickets > 0 && (
                    <div className="absolute bottom-0 right-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-tl">
                      {site.openTickets} TKT
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Recent Activity Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity?.map((activity, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <div className="mt-1">
                    <div className={cn(
                      "w-2 h-2 rounded-full mt-1.5",
                      activity.priority === "critical" ? "bg-red-500" :
                      activity.priority === "high" ? "bg-orange-500" :
                      activity.priority === "medium" ? "bg-yellow-500" :
                      "bg-blue-500"
                    )} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-medium text-foreground">
                        [{activity.siteName}] {activity.ticketTitle}
                      </p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {format(parseISO(activity.timestamp), "HH:mm")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{activity.action}</span>
                      <Badge variant="outline" className={cn(
                        "text-[10px] uppercase rounded-sm px-1 py-0 border-transparent",
                        activity.type === 'power' ? "bg-orange-500/10 text-orange-500" : "bg-blue-500/10 text-blue-500"
                      )}>
                        {activity.type}
                      </Badge>
                      <Badge variant="outline" className={cn(
                        "text-[10px] uppercase rounded-sm px-1 py-0 border-transparent",
                        activity.status === 'open' ? "bg-red-500/10 text-red-500" :
                        activity.status === 'in_progress' ? "bg-blue-500/10 text-blue-500" :
                        activity.status === 'resolved' ? "bg-green-500/10 text-green-500" :
                        "bg-gray-500/10 text-gray-400"
                      )}>
                        {activity.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, valueClass }: { title: string, value: string | number, icon: any, valueClass?: string }) {
  return (
    <Card className="bg-card/50 border-border">
      <CardContent className="p-4 flex flex-col gap-2">
        <div className="flex justify-between items-center text-muted-foreground">
          <span className="text-[10px] uppercase tracking-wider font-semibold">{title}</span>
          <Icon className="w-4 h-4 opacity-50" />
        </div>
        <div className={cn("text-2xl font-bold font-mono tracking-tight", valueClass || "text-foreground")}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="lg:col-span-2 h-[350px] w-full" />
        <Skeleton className="h-[350px] w-full" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[400px] w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    </div>
  );
}
