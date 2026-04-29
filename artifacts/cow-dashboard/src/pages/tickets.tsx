import { useState, useMemo } from "react";
import { useListTickets, getGetDashboardSummaryQueryKey, getGetSiteStatusQueryKey, getListTicketsQueryKey, getGetRecentActivityQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Filter, Search, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { TicketDrawer } from "@/components/ticket-drawer";
import { useQueryClient } from "@tanstack/react-query";
import type { ListTicketsType, ListTicketsStatus, ListTicketsPriority } from "@workspace/api-client-react/src/generated/api.schemas";

export default function Tickets() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ListTicketsType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ListTicketsStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<ListTicketsPriority | "all">("all");
  
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isNewTicket, setIsNewTicket] = useState(false);

  const queryClient = useQueryClient();

  const queryParams = useMemo(() => {
    const params: any = {};
    if (typeFilter !== "all") params.type = typeFilter;
    if (statusFilter !== "all") params.status = statusFilter;
    if (priorityFilter !== "all") params.priority = priorityFilter;
    return params;
  }, [typeFilter, statusFilter, priorityFilter]);

  const { data: tickets, isLoading, refetch } = useListTickets(queryParams);

  const filteredTickets = useMemo(() => {
    if (!tickets) return [];
    if (!search) return tickets;
    const lowerSearch = search.toLowerCase();
    return tickets.filter(t => 
      t.title.toLowerCase().includes(lowerSearch) || 
      t.siteName.toLowerCase().includes(lowerSearch) ||
      t.id.toString().includes(lowerSearch)
    );
  }, [tickets, search]);

  const handleRefresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSiteStatusQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  };

  const handleOpenTicket = (id: number) => {
    setSelectedTicketId(id);
    setIsNewTicket(false);
    setDrawerOpen(true);
  };

  const handleNewTicket = () => {
    setSelectedTicketId(null);
    setIsNewTicket(true);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Incident Tickets</h1>
          <p className="text-muted-foreground text-sm">Manage and track site outages and maintenance tasks.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={handleNewTicket} className="gap-2">
            <Plus className="w-4 h-4" /> New Ticket
          </Button>
        </div>
      </div>

      <Card className="bg-card/50 border-border">
        <div className="p-4 border-b border-border flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-black/20">
          <div className="flex flex-1 gap-2 w-full md:max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search ID, title, site..."
                className="pl-9 bg-black/20 border-border"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
            <Filter className="w-4 h-4 text-muted-foreground mr-2 hidden md:block" />
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
              <SelectTrigger className="w-[130px] bg-black/20">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="power">Power</SelectItem>
                <SelectItem value="telecom">Telecom</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-[130px] bg-black/20">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
              <SelectTrigger className="w-[130px] bg-black/20">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-black/20">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-[100px] font-mono text-xs text-muted-foreground">ID</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">SITE</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">TITLE</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">TYPE</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">PRIORITY</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">STATUS</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">CREATED</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Loading tickets...
                  </TableCell>
                </TableRow>
              ) : filteredTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No tickets found matching criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTickets.map((ticket) => (
                  <TableRow 
                    key={ticket.id} 
                    className="border-border hover:bg-white/5 cursor-pointer transition-colors"
                    onClick={() => handleOpenTicket(ticket.id)}
                  >
                    <TableCell className="font-mono font-medium text-muted-foreground">#{ticket.id}</TableCell>
                    <TableCell className="font-bold text-foreground">{ticket.siteName}</TableCell>
                    <TableCell className="max-w-[300px] truncate" title={ticket.title}>{ticket.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        ticket.type === "power" ? "bg-orange-500/10 text-orange-500 border-orange-500/20" : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      }>
                        {ticket.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        ticket.priority === "critical" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                        ticket.priority === "high" ? "bg-orange-500/10 text-orange-500 border-orange-500/20" :
                        ticket.priority === "medium" ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" :
                        "bg-green-500/10 text-green-500 border-green-500/20"
                      }>
                        {ticket.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        ticket.status === "open" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                        ticket.status === "in_progress" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                        ticket.status === "resolved" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                        "bg-gray-500/10 text-gray-400 border-gray-500/20"
                      }>
                        {ticket.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(parseISO(ticket.createdAt), "MMM dd, HH:mm")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TicketDrawer 
        open={drawerOpen} 
        onOpenChange={setDrawerOpen} 
        ticketId={selectedTicketId}
        isNew={isNewTicket}
      />
    </div>
  );
}
