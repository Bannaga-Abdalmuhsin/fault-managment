import { pgTable, serial, text, timestamp, doublePrecision, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sitesTable = pgTable("sites", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  zone: text("zone").notNull(),
  status: text("status").notNull().default("operational"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  deployedAt: timestamp("deployed_at"),
  // Power configuration stored locally (not in PBI)
  powerConfig: text("power_config"),                        // e.g. "Commercial + Standby Battery"
  batteryUsefulTimeHrs: real("battery_useful_time_hrs"),    // e.g. 1.67
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSiteSchema = createInsertSchema(sitesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sitesTable.$inferSelect;
