import { Router } from "express";
import { db, ticketsTable, sitesTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";

const router = Router();

router.get("/tickets", async (req, res) => {
  const { siteId, type, status, priority } = req.query as Record<string, string | undefined>;

  const conditions: SQL[] = [];
  if (siteId) conditions.push(eq(ticketsTable.siteId, parseInt(siteId)));
  if (type) conditions.push(eq(ticketsTable.type, type));
  if (status) conditions.push(eq(ticketsTable.status, status));
  if (priority) conditions.push(eq(ticketsTable.priority, priority));

  const tickets = await db
    .select({
      id: ticketsTable.id,
      siteId: ticketsTable.siteId,
      siteName: sitesTable.name,
      type: ticketsTable.type,
      status: ticketsTable.status,
      priority: ticketsTable.priority,
      title: ticketsTable.title,
      description: ticketsTable.description,
      assignedTo: ticketsTable.assignedTo,
      resolvedAt: ticketsTable.resolvedAt,
      createdAt: ticketsTable.createdAt,
      updatedAt: ticketsTable.updatedAt,
    })
    .from(ticketsTable)
    .leftJoin(sitesTable, eq(ticketsTable.siteId, sitesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(ticketsTable.createdAt);

  res.json(tickets);
});

router.post("/tickets", async (req, res) => {
  const body = req.body;
  const [ticket] = await db
    .insert(ticketsTable)
    .values({
      siteId: body.siteId,
      type: body.type,
      priority: body.priority,
      status: "open",
      title: body.title,
      description: body.description,
      assignedTo: body.assignedTo,
    })
    .returning();

  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.id, ticket.siteId));
  res.status(201).json({ ...ticket, siteName: site?.name ?? "" });
});

router.get("/tickets/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [ticket] = await db
    .select({
      id: ticketsTable.id,
      siteId: ticketsTable.siteId,
      siteName: sitesTable.name,
      type: ticketsTable.type,
      status: ticketsTable.status,
      priority: ticketsTable.priority,
      title: ticketsTable.title,
      description: ticketsTable.description,
      assignedTo: ticketsTable.assignedTo,
      resolvedAt: ticketsTable.resolvedAt,
      createdAt: ticketsTable.createdAt,
      updatedAt: ticketsTable.updatedAt,
    })
    .from(ticketsTable)
    .leftJoin(sitesTable, eq(ticketsTable.siteId, sitesTable.id))
    .where(eq(ticketsTable.id, id));

  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  res.json(ticket);
});

router.patch("/tickets/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const body = req.body;

  const [ticket] = await db
    .update(ticketsTable)
    .set({
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.assignedTo !== undefined && { assignedTo: body.assignedTo }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.resolvedAt !== undefined && { resolvedAt: new Date(body.resolvedAt) }),
      updatedAt: new Date(),
    })
    .where(eq(ticketsTable.id, id))
    .returning();

  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.id, ticket.siteId));
  res.json({ ...ticket, siteName: site?.name ?? "" });
});

export default router;
