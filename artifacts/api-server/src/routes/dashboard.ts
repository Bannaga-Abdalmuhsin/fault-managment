import { Router } from "express";
import { db, ticketsTable, sitesTable } from "@workspace/db";
import { eq, count, sql, and } from "drizzle-orm";

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  const sites = await db.select().from(sitesTable);
  const tickets = await db.select().from(ticketsTable);

  const totalSites = sites.length;
  const operationalSites = sites.filter((s) => s.status === "operational").length;
  const degradedSites = sites.filter((s) => s.status === "degraded").length;
  const offlineSites = sites.filter((s) => s.status === "offline").length;

  const totalTickets = tickets.length;
  const openTickets = tickets.filter((t) => t.status === "open").length;
  const inProgressTickets = tickets.filter((t) => t.status === "in_progress").length;
  const resolvedTickets = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;
  const criticalTickets = tickets.filter((t) => t.priority === "critical").length;
  const powerOutageTickets = tickets.filter((t) => t.type === "power").length;
  const telecomOutageTickets = tickets.filter((t) => t.type === "telecom").length;

  const resolvedWithTime = tickets.filter((t) => t.resolvedAt && t.createdAt);
  const avgResolutionHours =
    resolvedWithTime.length > 0
      ? resolvedWithTime.reduce((sum, t) => {
          const diff = (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);
          return sum + diff;
        }, 0) / resolvedWithTime.length
      : 0;

  res.json({
    totalSites,
    operationalSites,
    degradedSites,
    offlineSites,
    totalTickets,
    openTickets,
    inProgressTickets,
    resolvedTickets,
    criticalTickets,
    powerOutageTickets,
    telecomOutageTickets,
    avgResolutionHours: Math.round(avgResolutionHours * 10) / 10,
  });
});

router.get("/dashboard/outages-by-day", async (req, res) => {
  const tickets = await db.select().from(ticketsTable);

  const last7Days: { date: string; powerOutages: number; telecomOutages: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayTickets = tickets.filter((t) => {
      const ticketDate = new Date(t.createdAt).toISOString().split("T")[0];
      return ticketDate === dateStr;
    });
    last7Days.push({
      date: dateStr,
      powerOutages: dayTickets.filter((t) => t.type === "power").length,
      telecomOutages: dayTickets.filter((t) => t.type === "telecom").length,
    });
  }

  res.json(last7Days);
});

router.get("/dashboard/outages-by-type", async (req, res) => {
  const tickets = await db.select().from(ticketsTable);
  const total = tickets.length || 1;
  const powerCount = tickets.filter((t) => t.type === "power").length;
  const telecomCount = tickets.filter((t) => t.type === "telecom").length;

  res.json([
    { type: "power", count: powerCount, percentage: Math.round((powerCount / total) * 100) },
    { type: "telecom", count: telecomCount, percentage: Math.round((telecomCount / total) * 100) },
  ]);
});

router.get("/dashboard/site-status", async (req, res) => {
  const sites = await db.select().from(sitesTable);
  const tickets = await db.select().from(ticketsTable);

  const result = sites.map((site) => {
    const siteTickets = tickets.filter((t) => t.siteId === site.id);
    const openTickets = siteTickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
    const lastTicket = siteTickets
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .at(0);
    return {
      siteId: site.id,
      siteName: site.name,
      zone: site.zone,
      status: site.status,
      openTickets,
      lastIncident: lastTicket?.updatedAt ?? null,
    };
  });

  res.json(result);
});

router.get("/dashboard/recent-activity", async (req, res) => {
  const tickets = await db
    .select({
      id: ticketsTable.id,
      title: ticketsTable.title,
      siteName: sitesTable.name,
      type: ticketsTable.type,
      status: ticketsTable.status,
      priority: ticketsTable.priority,
      updatedAt: ticketsTable.updatedAt,
    })
    .from(ticketsTable)
    .leftJoin(sitesTable, eq(ticketsTable.siteId, sitesTable.id))
    .orderBy(sql`${ticketsTable.updatedAt} DESC`)
    .limit(10);

  const result = tickets.map((t) => ({
    ticketId: t.id,
    ticketTitle: t.title,
    siteName: t.siteName ?? "Unknown",
    type: t.type,
    status: t.status,
    priority: t.priority,
    timestamp: t.updatedAt,
    action: t.status === "resolved" ? "Ticket resolved" : t.status === "in_progress" ? "Work started" : "Ticket opened",
  }));

  res.json(result);
});

export default router;
