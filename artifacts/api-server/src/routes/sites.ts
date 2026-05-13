import { Router } from "express";
import { db, sitesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/sites", async (req, res) => {
  const sites = await db.select().from(sitesTable).orderBy(sitesTable.name);
  res.json(sites);
});

router.post("/sites", async (req, res) => {
  const body = req.body;
  const [site] = await db
    .insert(sitesTable)
    .values({
      name: body.name,
      location: body.location,
      zone: body.zone,
      status: body.status ?? "operational",
      latitude: body.latitude,
      longitude: body.longitude,
      deployedAt: body.deployedAt ? new Date(body.deployedAt) : null,
    })
    .returning();
  res.status(201).json(site);
});

router.get("/sites/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.id, id));
  if (!site) return res.status(404).json({ error: "Site not found" });
  res.json(site);
});

router.patch("/sites/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const body = req.body;
  const [site] = await db
    .update(sitesTable)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.location !== undefined && { location: body.location }),
      ...(body.zone !== undefined && { zone: body.zone }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.latitude !== undefined && { latitude: body.latitude }),
      ...(body.longitude !== undefined && { longitude: body.longitude }),
      ...(body.powerConfig !== undefined && { powerConfig: body.powerConfig }),
      ...(body.batteryUsefulTimeHrs !== undefined && { batteryUsefulTimeHrs: body.batteryUsefulTimeHrs }),
      updatedAt: new Date(),
    })
    .where(eq(sitesTable.id, id))
    .returning();
  if (!site) return res.status(404).json({ error: "Site not found" });
  res.json(site);
});

// PATCH /sites/by-name/:name/power — update power fields by site name (COW ID)
router.patch("/sites/by-name/:name/power", async (req, res) => {
  const { name } = req.params;
  const body = req.body as { powerConfig?: string; batteryUsefulTimeHrs?: number };
  const [site] = await db
    .update(sitesTable)
    .set({
      ...(body.powerConfig !== undefined          && { powerConfig: body.powerConfig }),
      ...(body.batteryUsefulTimeHrs !== undefined && { batteryUsefulTimeHrs: Number(body.batteryUsefulTimeHrs) }),
      updatedAt: new Date(),
    })
    .where(eq(sitesTable.name, name))
    .returning();
  if (!site) return res.status(404).json({ error: "Site not found" });
  res.json(site);
});

export default router;
