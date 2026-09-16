import { useGetSite, useListTickets, getGetSiteQueryKey, getListTicketsQueryKey } from "@workspace/api-client-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { RadioTower, MapPin, Activity, X } from "lucide-react";

interface SiteDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: number;
}

export function SiteDrawer({ open, onOpenChange, siteId }: SiteDrawerProps) {
  const { data: site, isLoading: loadingSite } = useGetSite(siteId, {
    query: { queryKey: getGetSiteQueryKey(siteId), enabled: !!siteId && open }
  });
  
  const { data: tickets, isLoading: loadingTickets } = useListTickets(
    { siteId }, 
    { query: { queryKey: getListTicketsQueryKey({ siteId }), enabled: !!siteId && open } }
  );

  if (loadingSite && !site) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent className="w-full sm:w-[500px] h-full rounded-t-none ml-auto border-l border-border bg-background">
          <div className="p-6 h-full flex items-center justify-center text-muted-foreground">Loading site details...</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="w-full sm:w-[500px] h-full rounded-t-none ml-auto border-l border-border bg-background flex flex-col">
        <DrawerHeader className="border-b border-border text-left px-6 py-4 flex flex-row items-start justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center text-primary">
                <RadioTower className="w-5 h-5" />
              </div>
              <div>
                <DrawerTitle className="text-xl leading-none">{site?.name}</DrawerTitle>
                <DrawerDescription className="mt-1 font-mono text-xs">ID: {site?.id}</DrawerDescription>
              </div>
            </div>
            
            <div className="flex items-center gap-4 mt-2">
              <Badge variant="outline" className={
                site?.status === "offline" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                site?.status === "degraded" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                "bg-green-500/10 text-green-500 border-green-500/20"
              }>
                {site?.status?.toUpperCase()}
              </Badge>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                {site?.zone}
              </div>
            </div>
          </div>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>
        </DrawerHeader>

        <div className="flex-1 overflow-auto px-6 py-6 space-y-8">
          <div className="space-y-4">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Site Details
            </h3>
            <div className="grid grid-cols-2 gap-4 bg-black/20 p-4 rounded border border-border">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Location</div>
                <div className="text-sm font-medium text-foreground">{site?.location}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Deployed At</div>
                <div className="text-sm font-medium text-foreground">
                  {site?.deployedAt ? format(parseISO(site.deployedAt), "MMM dd, yyyy") : "Unknown"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Coordinates</div>
                <div className="text-sm font-mono text-foreground">{site?.latitude?.toFixed(4)}, {site?.longitude?.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Created</div>
                <div className="text-sm font-medium text-foreground">
                  {site?.createdAt ? format(parseISO(site.createdAt), "MMM dd, yyyy") : "Unknown"}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2 justify-between">
              <span>Associated Tickets</span>
              <Badge variant="secondary" className="text-xs bg-black/40">{tickets?.length || 0}</Badge>
            </h3>
            
            {loadingTickets ? (
              <div className="text-center py-8 text-sm text-muted-foreground">Loading tickets...</div>
            ) : !tickets || tickets.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground bg-black/10 rounded border border-border/50">
                No tickets for this site.
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map(ticket => (
                  <div key={ticket.id} className="p-3 rounded border border-border bg-card/50 hover:bg-black/20 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-sm text-foreground">{ticket.title}</span>
                      <span className="text-xs font-mono text-muted-foreground">#{ticket.id}</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline" className={
                        ticket.type === "power" ? "bg-orange-500/10 text-orange-500 border-transparent text-[10px] px-1 py-0" : "bg-blue-500/10 text-blue-500 border-transparent text-[10px] px-1 py-0"
                      }>
                        {ticket.type}
                      </Badge>
                      <Badge variant="outline" className={
                        ticket.status === "open" ? "bg-red-500/10 text-red-500 border-transparent text-[10px] px-1 py-0" :
                        ticket.status === "in_progress" ? "bg-blue-500/10 text-blue-500 border-transparent text-[10px] px-1 py-0" :
                        ticket.status === "resolved" ? "bg-green-500/10 text-green-500 border-transparent text-[10px] px-1 py-0" :
                        "bg-gray-500/10 text-gray-400 border-transparent text-[10px] px-1 py-0"
                      }>
                        {ticket.status.replace("_", " ")}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto self-end">
                        {format(parseISO(ticket.createdAt), "MMM dd")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
