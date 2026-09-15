import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { storage, CrossTenantError } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import {
  withTenant,
  getTenant,
  requireTenantRole,
  TenantError,
  PRIVILEGED_ROLES,
} from "./tenantContext";
import {
  insertOwnerSchema,
  insertPatientSchema,
  insertAppointmentSchema,
  insertMedicalRecordSchema,
  insertTreatmentSchema,
  insertInvoiceSchema,
  insertInventoryItemSchema,
} from "@shared/schema";
import { z } from "zod";
import {
  getDayRangeInTimeZone,
  getWeekRangeInTimeZone,
  getMonthRangeInTimeZone,
  getRangeFromDayStringsInTimeZone,
} from "@shared/time";
import { PAYMENT_METHOD_VALUES } from "@shared/payment";
import { EXPENSE_CATEGORY_VALUES } from "@shared/expense";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage.js";
import { ObjectPermission } from "./objectAcl.js";

const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || "America/Mexico_City";

const paymentMethodEnum = z.enum(PAYMENT_METHOD_VALUES as [string, ...string[]]);
const expenseCategoryEnum = z.enum(EXPENSE_CATEGORY_VALUES as [string, ...string[]]);

const createExpenseRequestSchema = z.object({
  date: z.coerce.date().optional().nullable(),
  amount: z.number().positive(),
  category: expenseCategoryEnum,
  description: z.string().optional().nullable(),
  supplier: z.string().optional().nullable(),
  paymentMethod: paymentMethodEnum.optional().nullable(),
  inventoryItemId: z.string().min(1).optional().nullable(),
  quantity: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
}).strict()
  .refine((d) => d.category !== "inventario" || (!!d.inventoryItemId && !!d.quantity), {
    message: "La compra de inventario requiere producto y cantidad.",
    path: ["inventoryItemId"],
  });

const createInvoiceRequestSchema = z.object({
  ownerId: z.string().min(1),
  patientId: z.string().min(1).optional().nullable(),
  appointmentId: z.string().min(1).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
  taxRate: z.number().min(0).max(1).optional(),
  markPaid: z.boolean().optional(),
  paymentMethod: paymentMethodEnum.optional().nullable(),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
    treatmentId: z.string().min(1).optional().nullable(),
    inventoryItemId: z.string().min(1).optional().nullable(),
  })).min(1).max(100),
}).strict()
  .refine((d) => !d.markPaid || !!d.paymentMethod, {
    message: "Indica el método de pago al cobrar.",
    path: ["paymentMethod"],
  });

// Centralized fail-closed error mapping. Cross-tenant ids are reported as 404 so
// they are indistinguishable from "not found" (no existence leak).
function sendError(res: Response, error: unknown, context: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: "Validation error", errors: error.errors });
  }
  if (error instanceof TenantError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  if (error instanceof CrossTenantError) {
    return res.status(404).json({ message: "Recurso no encontrado", code: error.code });
  }
  if (error instanceof Error) {
    if (error.message === "APPOINTMENT_ALREADY_INVOICED") {
      return res.status(409).json({ message: "This appointment already has an invoice" });
    }
    if (error.message.startsWith("INSUFFICIENT_STOCK:")) {
      return res.status(409).json({ message: "No hay stock suficiente para uno de los productos.", code: "INSUFFICIENT_STOCK", inventoryItemId: error.message.split(":")[1] });
    }
  }
  console.error(`Error ${context}:`, error);
  return res.status(500).json({ message: `Failed: ${context}` });
}

// In-handler fail-closed privileged-role gate (throws TenantError → sendError).
function assertPrivileged(req: any) {
  requireTenantRole(getTenant(req), PRIVILEGED_ROLES);
}

function normalizeDateOnlyFields<T extends Record<string, any>>(data: T, fields: string[]): T {
  const normalized: Record<string, any> = { ...data };
  for (const field of fields) if (normalized[field] === "") normalized[field] = null;
  return normalized as T;
}

function normalizeDateTimeFields<T extends Record<string, any>>(data: T, fields: string[]): T {
  const normalized: Record<string, any> = { ...data };
  for (const field of fields) {
    const value = normalized[field];
    if (value === "") normalized[field] = null;
    else if (typeof value === "string") normalized[field] = new Date(value);
  }
  return normalized as T;
}

function buildRevenueLabel(period: string, range: { start: Date; end: Date }, timeZone: string): string {
  const lastDay = new Date(range.end.getTime() - 1);
  const day = (d: Date) => new Intl.DateTimeFormat("es-MX", { timeZone, day: "numeric", month: "short" }).format(d);
  const dayYear = (d: Date) => new Intl.DateTimeFormat("es-MX", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(d);
  const monthYear = (d: Date) => {
    const s = new Intl.DateTimeFormat("es-MX", { timeZone, month: "long", year: "numeric" }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  switch (period) {
    case "day": return "Hoy";
    case "week": return `${day(range.start)} – ${day(lastDay)}`;
    case "month": return monthYear(range.start);
    default: return `${day(range.start)} – ${dayYear(lastDay)}`;
  }
}

function resolveRange(req: any): { start: Date; end: Date } | { error: string } {
  const now = new Date();
  const period = String(req.query.period ?? "month");
  const fromQ = req.query.from ? String(req.query.from) : undefined;
  const toQ = req.query.to ? String(req.query.to) : undefined;
  if (fromQ || toQ) {
    if (!fromQ || !toQ) return { error: "Indica ambas fechas: from y to." };
    const r = getRangeFromDayStringsInTimeZone(fromQ, toQ, CLINIC_TIMEZONE);
    return r ?? { error: "Rango de fechas inválido." };
  }
  if (period === "day") return getDayRangeInTimeZone(now, CLINIC_TIMEZONE);
  if (period === "week") return getWeekRangeInTimeZone(now, CLINIC_TIMEZONE);
  if (period === "month") return getMonthRangeInTimeZone(now, CLINIC_TIMEZONE);
  return { error: "Periodo inválido. Usa day, week, month o from/to." };
}

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  // Auth: current user (global identity — no tenant needed).
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      res.json(user);
    } catch (error) { sendError(res, error, "fetch user"); }
  });

  // --- Dashboard (tenant-scoped) ---
  app.get("/api/dashboard/stats", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getDashboardStats(getTenant(req))); }
    catch (error) { sendError(res, error, "fetch dashboard stats"); }
  });

  app.get("/api/dashboard/today-appointments", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getTodayAppointments(getTenant(req))); }
    catch (error) { sendError(res, error, "fetch today's appointments"); }
  });

  app.get("/api/dashboard/recent-activity", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getRecentActivity(getTenant(req))); }
    catch (error) { sendError(res, error, "fetch recent activity"); }
  });

  app.get("/api/dashboard/revenue", isAuthenticated, withTenant, async (req, res) => {
    try {
      const range = resolveRange(req);
      if ("error" in range) return res.status(400).json({ message: range.error });
      const ctx = getTenant(req);
      const [total, byMethod] = await Promise.all([
        storage.getRevenueBetween(ctx, range.start, range.end),
        storage.getRevenueByMethodBetween(ctx, range.start, range.end),
      ]);
      const period = String(req.query.period ?? (req.query.from ? "custom" : "month"));
      res.json({ period, from: range.start.toISOString(), to: range.end.toISOString(), total, byMethod, label: buildRevenueLabel(period, range, CLINIC_TIMEZONE) });
    } catch (error) { sendError(res, error, "fetch revenue"); }
  });

  app.get("/api/dashboard/expenses", isAuthenticated, withTenant, async (req, res) => {
    try {
      const range = resolveRange(req);
      if ("error" in range) return res.status(400).json({ message: range.error });
      const summary = await storage.getExpenseSummaryBetween(getTenant(req), range.start, range.end);
      const period = String(req.query.period ?? (req.query.from ? "custom" : "month"));
      res.json({ from: range.start.toISOString(), to: range.end.toISOString(), label: buildRevenueLabel(period, range, CLINIC_TIMEZONE), ...summary });
    } catch (error) { sendError(res, error, "fetch expense summary"); }
  });

  // --- Expenses ---
  app.get("/api/expenses", isAuthenticated, withTenant, async (req, res) => {
    try {
      let range: { start: Date; end: Date } | undefined;
      if (req.query.from || req.query.to || req.query.period) {
        const r = resolveRange(req);
        if ("error" in r) return res.status(400).json({ message: r.error });
        range = r;
      }
      res.json(await storage.getExpenses(getTenant(req), range));
    } catch (error) { sendError(res, error, "fetch expenses"); }
  });

  app.post("/api/expenses", isAuthenticated, withTenant, async (req, res) => {
    try {
      const data = createExpenseRequestSchema.parse(req.body);
      res.status(201).json(await storage.createExpense(getTenant(req), data));
    } catch (error) { sendError(res, error, "create expense"); }
  });

  app.delete("/api/expenses/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      assertPrivileged(req);
      await storage.deleteExpense(getTenant(req), req.params.id);
      res.status(204).send();
    } catch (error) { sendError(res, error, "delete expense"); }
  });

  // --- Owners ---
  app.get("/api/owners", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getOwners(getTenant(req))); }
    catch (error) { sendError(res, error, "fetch owners"); }
  });

  app.get("/api/public-owner", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getOrCreatePublicOwner(getTenant(req))); }
    catch (error) { sendError(res, error, "fetch public owner"); }
  });

  app.get("/api/owners/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      const owner = await storage.getOwner(getTenant(req), req.params.id);
      if (!owner) return res.status(404).json({ message: "Owner not found" });
      res.json(owner);
    } catch (error) { sendError(res, error, "fetch owner"); }
  });

  app.post("/api/owners", isAuthenticated, withTenant, async (req, res) => {
    try {
      const validated = insertOwnerSchema.parse(req.body);
      res.status(201).json(await storage.createOwner(getTenant(req), validated));
    } catch (error) { sendError(res, error, "create owner"); }
  });

  app.put("/api/owners/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      const validated = insertOwnerSchema.partial().parse(req.body);
      const owner = await storage.updateOwner(getTenant(req), req.params.id, validated);
      if (!owner) return res.status(404).json({ message: "Owner not found" });
      res.json(owner);
    } catch (error) { sendError(res, error, "update owner"); }
  });

  app.delete("/api/owners/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      assertPrivileged(req);
      await storage.deleteOwner(getTenant(req), req.params.id);
      res.status(204).send();
    } catch (error) { sendError(res, error, "delete owner"); }
  });

  // --- Patients ---
  app.get("/api/patients", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getPatients(getTenant(req))); }
    catch (error) { sendError(res, error, "fetch patients"); }
  });

  app.get("/api/patients/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      const patient = await storage.getPatient(getTenant(req), req.params.id);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      res.json(patient);
    } catch (error) { sendError(res, error, "fetch patient"); }
  });

  app.get("/api/owners/:ownerId/patients", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getPatientsByOwner(getTenant(req), req.params.ownerId)); }
    catch (error) { sendError(res, error, "fetch owner's patients"); }
  });

  app.post("/api/patients", isAuthenticated, withTenant, async (req, res) => {
    try {
      const payload = normalizeDateOnlyFields(req.body, ["birthDate"]);
      const validated = insertPatientSchema.parse(payload);
      res.status(201).json(await storage.createPatient(getTenant(req), validated));
    } catch (error) { sendError(res, error, "create patient"); }
  });

  app.put("/api/patients/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      const payload = normalizeDateOnlyFields(req.body, ["birthDate"]);
      const validated = insertPatientSchema.partial().parse(payload);
      if (!validated.ownerId) delete (validated as any).ownerId;
      const patient = await storage.updatePatient(getTenant(req), req.params.id, validated);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      res.json(patient);
    } catch (error) { sendError(res, error, "update patient"); }
  });

  app.delete("/api/patients/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      assertPrivileged(req);
      await storage.deletePatient(getTenant(req), req.params.id);
      res.status(204).send();
    } catch (error) { sendError(res, error, "delete patient"); }
  });

  // --- Appointments ---
  const appointmentCoercedSchema = insertAppointmentSchema.extend({ appointmentDate: z.coerce.date() });

  app.get("/api/appointments", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getAppointments(getTenant(req))); }
    catch (error) { sendError(res, error, "fetch appointments"); }
  });

  app.get("/api/appointments/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      const appointment = await storage.getAppointment(getTenant(req), req.params.id);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });
      res.json(appointment);
    } catch (error) { sendError(res, error, "fetch appointment"); }
  });

  app.post("/api/appointments", isAuthenticated, withTenant, async (req, res) => {
    try {
      const validated = appointmentCoercedSchema.parse(req.body);
      res.status(201).json(await storage.createAppointment(getTenant(req), validated));
    } catch (error) { sendError(res, error, "create appointment"); }
  });

  app.put("/api/appointments/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      const validated = appointmentCoercedSchema.partial().parse(req.body);
      const appointment = await storage.updateAppointment(getTenant(req), req.params.id, validated);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });
      res.json(appointment);
    } catch (error) { sendError(res, error, "update appointment"); }
  });

  app.delete("/api/appointments/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      assertPrivileged(req);
      await storage.deleteAppointment(getTenant(req), req.params.id);
      res.status(204).send();
    } catch (error) { sendError(res, error, "delete appointment"); }
  });

  // --- Medical records ---
  app.get("/api/medical-records", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getMedicalRecords(getTenant(req))); }
    catch (error) { sendError(res, error, "fetch medical records"); }
  });

  app.get("/api/patients/:patientId/medical-records", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getPatientMedicalRecords(getTenant(req), req.params.patientId)); }
    catch (error) { sendError(res, error, "fetch patient medical records"); }
  });

  app.post("/api/medical-records", isAuthenticated, withTenant, async (req, res) => {
    try {
      const validated = insertMedicalRecordSchema.parse(req.body);
      // Author is derived server-side inside storage (SEC-GAP-03), never trusted from client.
      res.status(201).json(await storage.createMedicalRecord(getTenant(req), validated));
    } catch (error) { sendError(res, error, "create medical record"); }
  });

  // --- Treatments ---
  app.get("/api/treatments", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getTreatments(getTenant(req))); }
    catch (error) { sendError(res, error, "fetch treatments"); }
  });

  app.post("/api/treatments", isAuthenticated, withTenant, async (req, res) => {
    try {
      assertPrivileged(req);
      const validated = insertTreatmentSchema.parse(req.body);
      res.status(201).json(await storage.createTreatment(getTenant(req), validated));
    } catch (error) { sendError(res, error, "create treatment"); }
  });

  app.put("/api/treatments/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      assertPrivileged(req);
      const validated = insertTreatmentSchema.partial().parse(req.body);
      const treatment = await storage.updateTreatment(getTenant(req), req.params.id, validated);
      if (!treatment) return res.status(404).json({ message: "Treatment not found" });
      res.json(treatment);
    } catch (error) { sendError(res, error, "update treatment"); }
  });

  app.delete("/api/treatments/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      assertPrivileged(req);
      await storage.deleteTreatment(getTenant(req), req.params.id);
      res.status(204).send();
    } catch (error) { sendError(res, error, "delete treatment"); }
  });

  // --- Invoices ---
  app.get("/api/invoices", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getInvoices(getTenant(req))); }
    catch (error) { sendError(res, error, "fetch invoices"); }
  });

  app.get("/api/invoices/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(getTenant(req), req.params.id);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      res.json(invoice);
    } catch (error) { sendError(res, error, "fetch invoice"); }
  });

  app.post("/api/invoices", isAuthenticated, withTenant, async (req, res) => {
    try {
      const ctx = getTenant(req);
      const data = createInvoiceRequestSchema.parse(req.body);
      if (data.appointmentId) {
        const existing = await storage.getInvoiceByAppointment(ctx, data.appointmentId);
        if (existing) return res.status(409).json({ message: "This appointment already has an invoice", invoice: existing });
      }
      res.status(201).json(await storage.createInvoiceWithItems(ctx, data));
    } catch (error) { sendError(res, error, "create invoice"); }
  });

  app.put("/api/invoices/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      const payload = normalizeDateTimeFields(req.body, ["issueDate", "dueDate", "paymentDate"]);
      const validated = insertInvoiceSchema.partial().parse(payload);
      if (validated.paymentMethod != null && !paymentMethodEnum.safeParse(validated.paymentMethod).success) {
        return res.status(400).json({ message: "Método de pago inválido." });
      }
      if (validated.status === "paid" && !validated.paymentMethod) {
        return res.status(400).json({ message: "Indica el método de pago al marcar la factura como pagada." });
      }
      const invoice = await storage.updateInvoice(getTenant(req), req.params.id, validated);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      res.json(invoice);
    } catch (error) { sendError(res, error, "update invoice"); }
  });

  app.delete("/api/invoices/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      assertPrivileged(req);
      const ctx = getTenant(req);
      const invoice = await storage.getInvoice(ctx, req.params.id);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      await storage.deleteInvoice(ctx, req.params.id);
      res.status(204).send();
    } catch (error) { sendError(res, error, "delete invoice"); }
  });

  // --- Inventory ---
  app.get("/api/inventory", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getInventoryItems(getTenant(req))); }
    catch (error) { sendError(res, error, "fetch inventory"); }
  });

  app.get("/api/inventory/low-stock", isAuthenticated, withTenant, async (req, res) => {
    try { res.json(await storage.getLowStockItems(getTenant(req))); }
    catch (error) { sendError(res, error, "fetch low stock"); }
  });

  app.post("/api/inventory", isAuthenticated, withTenant, async (req, res) => {
    try {
      assertPrivileged(req);
      const validated = insertInventoryItemSchema.parse(req.body);
      res.status(201).json(await storage.createInventoryItem(getTenant(req), validated));
    } catch (error) { sendError(res, error, "create inventory item"); }
  });

  app.put("/api/inventory/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      assertPrivileged(req);
      const validated = insertInventoryItemSchema.partial().parse(req.body);
      const item = await storage.updateInventoryItem(getTenant(req), req.params.id, validated);
      if (!item) return res.status(404).json({ message: "Inventory item not found" });
      res.json(item);
    } catch (error) { sendError(res, error, "update inventory item"); }
  });

  app.delete("/api/inventory/:id", isAuthenticated, withTenant, async (req, res) => {
    try {
      assertPrivileged(req);
      await storage.deleteInventoryItem(getTenant(req), req.params.id);
      res.status(204).send();
    } catch (error) { sendError(res, error, "delete inventory item"); }
  });

  // --- Object storage (per-user ACL; not tenant-owned domain data) ---
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({ objectFile, userId, requestedPermission: ObjectPermission.READ });
      if (!canAccess) return res.sendStatus(401);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) return res.sendStatus(404);
      return res.sendStatus(500);
    }
  });

  app.post("/api/objects/upload", isAuthenticated, async (_req, res) => {
    const objectStorageService = new ObjectStorageService();
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    res.json({ uploadURL });
  });

  app.put("/api/patient-photos", isAuthenticated, withTenant, async (req, res) => {
    if (!req.body.patientId || !req.body.photoURL) return res.status(400).json({ error: "patientId and photoURL are required" });
    const userId = (req.user as any)?.claims?.sub;
    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(req.body.photoURL, { owner: userId, visibility: "private" });
      const updated = await storage.updatePatient(getTenant(req), req.body.patientId, { photoUrl: objectPath });
      if (!updated) return res.status(404).json({ error: "Patient not found" });
      res.status(200).json({ objectPath });
    } catch (error) { sendError(res, error, "set patient photo"); }
  });

  app.put("/api/owner-photos", isAuthenticated, withTenant, async (req, res) => {
    if (!req.body.ownerId || !req.body.photoURL) return res.status(400).json({ error: "ownerId and photoURL are required" });
    const userId = (req.user as any)?.claims?.sub;
    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(req.body.photoURL, { owner: userId, visibility: "private" });
      const updated = await storage.updateOwner(getTenant(req), req.body.ownerId, { photoUrl: objectPath });
      if (!updated) return res.status(404).json({ error: "Owner not found" });
      res.status(200).json({ objectPath });
    } catch (error) { sendError(res, error, "set owner photo"); }
  });

  const httpServer = createServer(app);
  return httpServer;
}
