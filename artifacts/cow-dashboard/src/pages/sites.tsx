import { useState, useMemo } from "react";
import { useListSites, getGetDashboardSummaryQueryKey, getGetSiteStatusQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw, RadioTower } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { SiteDrawer } from "@/components/site-drawer";

export default function Sites() {
  const [search, setSearch] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  const queryClient = useQueryClient();
  const { data: sites, isLoading, refetch } = useListSites();

  const filteredSites = useMemo(() => {
    if (!sites) return [];
    if (!search) return sites;
    const lowerSearch = search.toLowerCase();
    return sites.filter(s => 
      s.name.toLowerCase().includes(lowerSearch) || 
      s.zone.toLowerCase().includes(lowerSearch) ||
      s.location.toLowerCase().includes(lowerSearch)
    );
  }, [sites, search]);

  const handleRefresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSiteStatusQueryKey() });
  };

  const handleOpenSite = (id: number) => {
    setSelectedSiteId(id);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">COW Sites Directory</h1>
          <p className="text-muted-foreground text-sm">Inventory and status of all mobile cell towers.</p>
        </div>
        <Button variant="outline" size="icon" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <Card className="bg-card/50 border-border">
        <div className="p-4 border-b border-border flex items-center justify-between bg-black/20">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sites by name, zone, location..."
              className="pl-9 bg-black/20 border-border"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-black/20">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-[50px]"></TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">SITE NAME</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">ZONE</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">LOCATION</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">STATUS</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">DEPLOYED</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Loading sites...
                  </TableCell>
                </TableRow>
              ) : filteredSites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No sites found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSites.map((site) => (
                  <TableRow 
                    key={site.id} 
                    className="border-border hover:bg-white/5 cursor-pointer transition-colors"
                    onClick={() => handleOpenSite(site.id)}
                  >
                    <TableCell>
                      <div className="w-8 h-8 rounded bg-black/30 flex items-center justify-center">
                        <RadioTower className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </TableCell>
                    <TableCell className="font-bold text-foreground">
                      {site.name}
                      {site.status === "offline" && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{site.zone}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[200px]" title={site.location}>{site.location}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        site.status === "offline" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                        site.status === "degraded" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                        "bg-green-500/10 text-green-500 border-green-500/20"
                      }>
                        {site.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {site.deployedAt ? format(parseISO(site.deployedAt), "MMM dd, yyyy") : "Unknown"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedSiteId && (
        <SiteDrawer 
          open={drawerOpen} 
          onOpenChange={setDrawerOpen} 
          siteId={selectedSiteId}
        />
      )}
    </div>
  );
}
