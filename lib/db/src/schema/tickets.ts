import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull(),
  type: text("type").notNull(), // "power" | "telecom"
  status: text("status").notNull().default("open"), // "open" | "in_progress" | "resolved" | "closed"
  priority: text("priority").notNull().default("medium"), // "critical" | "high" | "medium" | "low"
  title: text("title").notNull(),
  description: text("description"),
  assignedTo: text("assigned_to"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTicketSchema = createInsertSchema(ticketsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof ticketsTable.$inferSelect;
