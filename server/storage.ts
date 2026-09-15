import {
  users,
  owners,
  patients,
  appointments,
  medicalRecords,
  treatments,
  invoices,
  invoiceItems,
  inventoryItems,
  expenses,
  staffMembers,
  type StaffMember,
  type Expense,
  type ExpenseWithItem,
  type User,
  type UpsertUser,
  type Owner,
  type InsertOwner,
  type Patient,
  type InsertPatient,
  type PatientWithOwner,
  type Appointment,
  type InsertAppointment,
  type AppointmentWithDetails,
  type MedicalRecord,
  type InsertMedicalRecord,
  type MedicalRecordWithDetails,
  type Treatment,
  type InsertTreatment,
  type Invoice,
  type InsertInvoice,
  type InvoiceWithDetails,
  type InvoiceItem,
  type InventoryItem,
  type InsertInventoryItem,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, asc, gte, isNotNull } from "drizzle-orm";
import { computeInvoiceTotals, computeInvoiceLineTotal } from "@shared/invoice";
import { getDayRangeInTimeZone, getMonthRangeInTimeZone } from "@shared/time";
import { PERSONAL_CATEGORY } from "@shared/expense";
import { type TenantContext, requireBranch, requireActiveStaff } from "./tenantContext";

// The clinic's timezone anchors "today" / "this month" on the dashboard.
const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || "America/Mexico_City";

// Thrown when a referenced resource is not found in the current tenant. Callers
// map this to a 404/409 so a cross-tenant id can never leak or be mutated.
export class CrossTenantError extends Error {
  code = "CROSS_TENANT_OR_NOT_FOUND";
  constructor(what: string) {
    super(`CROSS_TENANT_OR_NOT_FOUND:${what}`);
  }
}

export interface CreateExpenseInput {
  date?: Date | null;
  amount: number;
  category: string;
  description?: string | null;
  supplier?: string | null;
  paymentMethod?: string | null;
  inventoryItemId?: string | null;
  quantity?: number | null;
  notes?: string | null;
}

export interface CreateInvoiceInput {
  ownerId: string;
  patientId?: string | null;
  appointmentId?: string | null;
  dueDate?: Date | null;
  notes?: string | null;
  taxRate?: number;
  markPaid?: boolean;
  paymentMethod?: string | null;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    treatmentId?: string | null;
    inventoryItemId?: string | null;
  }[];
}

// GLOBAL invoice number sequence. Invoice folios are unique across the entire
// system, not per-organization (HQ HA-FOUND-001 PR #23 review #1). A single
// shared sequence + the global UNIQUE(invoice_number) constraint guarantee no
// two invoices — in any tenant — ever share a folio.
async function reserveNextInvoiceNumber(tx: any): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ha_invoice_number_seq'))`);
  await tx.execute(sql.raw(`create sequence if not exists "invoice_number_seq" start with 1`));

  const maxInvoiceResult: any = await tx.execute(sql`
    select coalesce(max(substring(invoice_number from 5)::bigint), 0) as max_number
    from invoices
    where invoice_number ~ '^INV-[0-9]{6}$'
  `);
  const sequenceState: any = await tx.execute(sql.raw(`select last_value, is_called from "invoice_number_seq"`));

  const maxExisting = Number(maxInvoiceResult?.rows?.[0]?.max_number ?? 0);
  const lastValue = Number(sequenceState?.rows?.[0]?.last_value ?? 1);
  const isCalled = Boolean(sequenceState?.rows?.[0]?.is_called);

  if (maxExisting > lastValue || (!isCalled && maxExisting >= lastValue)) {
    await tx.execute(sql.raw(`select setval('"invoice_number_seq"', ${maxExisting}, true)`));
  }

  const sequenceResult: any = await tx.execute(sql.raw(`select nextval('"invoice_number_seq"') as nextval`));
  const nextValue = sequenceResult?.rows?.[0]?.nextval;
  if (nextValue === undefined || nextValue === null) throw new Error("INVOICE_SEQUENCE_UNAVAILABLE");
  return `INV-${String(nextValue).padStart(6, "0")}`;
}

export interface IStorage {
  // User operations (global identity — NOT tenant-owned)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  getOwners(ctx: TenantContext): Promise<Owner[]>;
  getOwner(ctx: TenantContext, id: string): Promise<Owner | undefined>;
  getOrCreatePublicOwner(ctx: TenantContext): Promise<Owner>;
  createOwner(ctx: TenantContext, owner: InsertOwner): Promise<Owner>;
  updateOwner(ctx: TenantContext, id: string, owner: Partial<InsertOwner>): Promise<Owner | undefined>;
  deleteOwner(ctx: TenantContext, id: string): Promise<void>;

  getPatients(ctx: TenantContext): Promise<PatientWithOwner[]>;
  getPatient(ctx: TenantContext, id: string): Promise<PatientWithOwner | undefined>;
  getPatientsByOwner(ctx: TenantContext, ownerId: string): Promise<PatientWithOwner[]>;
  createPatient(ctx: TenantContext, patient: InsertPatient): Promise<Patient>;
  updatePatient(ctx: TenantContext, id: string, patient: Partial<InsertPatient>): Promise<Patient | undefined>;
  deletePatient(ctx: TenantContext, id: string): Promise<void>;

  getAppointments(ctx: TenantContext): Promise<AppointmentWithDetails[]>;
  getAppointment(ctx: TenantContext, id: string): Promise<AppointmentWithDetails | undefined>;
  getTodayAppointments(ctx: TenantContext): Promise<AppointmentWithDetails[]>;
  createAppointment(ctx: TenantContext, appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(ctx: TenantContext, id: string, appointment: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  deleteAppointment(ctx: TenantContext, id: string): Promise<void>;

  getMedicalRecords(ctx: TenantContext): Promise<MedicalRecordWithDetails[]>;
  getMedicalRecord(ctx: TenantContext, id: string): Promise<MedicalRecordWithDetails | undefined>;
  getPatientMedicalRecords(ctx: TenantContext, patientId: string): Promise<MedicalRecordWithDetails[]>;
  createMedicalRecord(ctx: TenantContext, record: InsertMedicalRecord): Promise<MedicalRecord>;

  getTreatments(ctx: TenantContext): Promise<Treatment[]>;
  getTreatment(ctx: TenantContext, id: string): Promise<Treatment | undefined>;
  createTreatment(ctx: TenantContext, treatment: InsertTreatment): Promise<Treatment>;
  updateTreatment(ctx: TenantContext, id: string, treatment: Partial<InsertTreatment>): Promise<Treatment | undefined>;
  deleteTreatment(ctx: TenantContext, id: string): Promise<void>;

  getInvoices(ctx: TenantContext): Promise<InvoiceWithDetails[]>;
  getInvoice(ctx: TenantContext, id: string): Promise<InvoiceWithDetails | undefined>;
  getInvoiceByAppointment(ctx: TenantContext, appointmentId: string): Promise<Invoice | undefined>;
  createInvoiceWithItems(ctx: TenantContext, input: CreateInvoiceInput): Promise<InvoiceWithDetails>;
  updateInvoice(ctx: TenantContext, id: string, invoice: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  deleteInvoice(ctx: TenantContext, id: string): Promise<void>;

  getInventoryItems(ctx: TenantContext): Promise<InventoryItem[]>;
  getInventoryItem(ctx: TenantContext, id: string): Promise<InventoryItem | undefined>;
  getLowStockItems(ctx: TenantContext): Promise<InventoryItem[]>;
  createInventoryItem(ctx: TenantContext, item: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(ctx: TenantContext, id: string, item: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined>;
  deleteInventoryItem(ctx: TenantContext, id: string): Promise<void>;

  getExpenses(ctx: TenantContext, range?: { start: Date; end: Date }): Promise<ExpenseWithItem[]>;
  createExpense(ctx: TenantContext, input: CreateExpenseInput): Promise<Expense>;
  deleteExpense(ctx: TenantContext, id: string): Promise<void>;
  getExpenseSummaryBetween(ctx: TenantContext, start: Date, end: Date): Promise<{
    total: number; business: number; personal: number;
    byCategory: { category: string; total: number }[];
    byMethod: { method: string; total: number }[];
  }>;

  getDashboardStats(ctx: TenantContext): Promise<{ todayAppointments: number; activePatients: number; monthlyRevenue: number; lowStock: number }>;
  getRevenueBetween(ctx: TenantContext, start: Date, end: Date): Promise<number>;
  getRevenueByMethodBetween(ctx: TenantContext, start: Date, end: Date): Promise<{ method: string; total: number }[]>;
  getRecentActivity(ctx: TenantContext): Promise<{ id: string; type: "success" | "info" | "warning"; description: string; user: string | null; timestamp: Date }[]>;
}

export class DatabaseStorage implements IStorage {
  // ---- Users (global) ----
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({ target: users.id, set: { ...userData, updatedAt: new Date() } })
      .returning();
    return user;
  }

  // ---- Owners ----
  async getOwners(ctx: TenantContext): Promise<Owner[]> {
    return await db.select().from(owners)
      .where(eq(owners.organizationId, ctx.organizationId))
      .orderBy(asc(owners.lastName), asc(owners.firstName));
  }

  async getOwner(ctx: TenantContext, id: string): Promise<Owner | undefined> {
    const [owner] = await db.select().from(owners)
      .where(and(eq(owners.id, id), eq(owners.organizationId, ctx.organizationId)));
    return owner;
  }

  // Walk-in "Público General" — scoped per organization (Tenant B never reuses A's).
  async getOrCreatePublicOwner(ctx: TenantContext): Promise<Owner> {
    const [existing] = await db.select().from(owners)
      .where(and(eq(owners.organizationId, ctx.organizationId), eq(owners.isPublic, true)))
      .limit(1);
    if (existing) return existing;
    const [created] = await db.insert(owners).values({
      organizationId: ctx.organizationId,
      firstName: "Público",
      lastName: "General",
      isPublic: true,
      notes: "Cliente genérico para ventas de mostrador",
    }).returning();
    return created;
  }

  async createOwner(ctx: TenantContext, owner: InsertOwner): Promise<Owner> {
    const [created] = await db.insert(owners)
      .values({ ...owner, organizationId: ctx.organizationId })
      .returning();
    return created;
  }

  async updateOwner(ctx: TenantContext, id: string, owner: Partial<InsertOwner>): Promise<Owner | undefined> {
    const { organizationId: _o, ...patch } = owner as any;
    const [updated] = await db.update(owners)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(owners.id, id), eq(owners.organizationId, ctx.organizationId)))
      .returning();
    return updated;
  }

  async deleteOwner(ctx: TenantContext, id: string): Promise<void> {
    await db.delete(owners)
      .where(and(eq(owners.id, id), eq(owners.organizationId, ctx.organizationId)));
  }

  // ---- Patients ----
  async getPatients(ctx: TenantContext): Promise<PatientWithOwner[]> {
    return await db.select().from(patients)
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .where(and(eq(patients.organizationId, ctx.organizationId), eq(patients.isActive, true)))
      .orderBy(asc(patients.name))
      .then((rows) => rows.map((row) => ({ ...row.patients, owner: row.owners! })));
  }

  async getPatient(ctx: TenantContext, id: string): Promise<PatientWithOwner | undefined> {
    const [result] = await db.select().from(patients)
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .where(and(eq(patients.id, id), eq(patients.organizationId, ctx.organizationId)));
    if (!result) return undefined;
    return { ...result.patients, owner: result.owners! };
  }

  async getPatientsByOwner(ctx: TenantContext, ownerId: string): Promise<PatientWithOwner[]> {
    return await db.select().from(patients)
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .where(and(eq(patients.ownerId, ownerId), eq(patients.organizationId, ctx.organizationId), eq(patients.isActive, true)))
      .orderBy(asc(patients.name))
      .then((rows) => rows.map((row) => ({ ...row.patients, owner: row.owners! })));
  }

  async createPatient(ctx: TenantContext, patient: InsertPatient): Promise<Patient> {
    // Owner must belong to this org (composite FK enforces; explicit check gives
    // a clean error and blocks attaching a Patient to another tenant's Owner).
    const owner = await this.getOwner(ctx, patient.ownerId);
    if (!owner) throw new CrossTenantError("owner");
    const [created] = await db.insert(patients)
      .values({ ...patient, organizationId: ctx.organizationId })
      .returning();
    return created;
  }

  async updatePatient(ctx: TenantContext, id: string, patient: Partial<InsertPatient>): Promise<Patient | undefined> {
    const { organizationId: _o, ...patch } = patient as any;
    if (patch.ownerId) {
      const owner = await this.getOwner(ctx, patch.ownerId);
      if (!owner) throw new CrossTenantError("owner");
    }
    const [updated] = await db.update(patients)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(patients.id, id), eq(patients.organizationId, ctx.organizationId)))
      .returning();
    return updated;
  }

  async deletePatient(ctx: TenantContext, id: string): Promise<void> {
    await db.update(patients).set({ isActive: false })
      .where(and(eq(patients.id, id), eq(patients.organizationId, ctx.organizationId)));
  }

  // ---- Appointments ----
  private mapAppt = (row: any): AppointmentWithDetails => ({
    ...row.appointments,
    patient: { ...row.patients!, owner: row.owners! },
    veterinarian: row.users ?? null,
    staffMember: row.staff_members ?? null,
  });

  async getAppointments(ctx: TenantContext): Promise<AppointmentWithDetails[]> {
    const branchId = requireBranch(ctx);
    return await db.select().from(appointments)
      .leftJoin(patients, eq(appointments.patientId, patients.id))
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .leftJoin(users, eq(appointments.veterinarianId, users.id))
      .leftJoin(staffMembers, eq(appointments.staffMemberId, staffMembers.id))
      .where(and(eq(appointments.organizationId, ctx.organizationId), eq(appointments.branchId, branchId)))
      .orderBy(desc(appointments.appointmentDate))
      .then((rows) => rows.map(this.mapAppt));
  }

  async getAppointment(ctx: TenantContext, id: string): Promise<AppointmentWithDetails | undefined> {
    const branchId = requireBranch(ctx);
    const [result] = await db.select().from(appointments)
      .leftJoin(patients, eq(appointments.patientId, patients.id))
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .leftJoin(users, eq(appointments.veterinarianId, users.id))
      .leftJoin(staffMembers, eq(appointments.staffMemberId, staffMembers.id))
      .where(and(eq(appointments.id, id), eq(appointments.organizationId, ctx.organizationId), eq(appointments.branchId, branchId)));
    return result ? this.mapAppt(result) : undefined;
  }

  async getTodayAppointments(ctx: TenantContext): Promise<AppointmentWithDetails[]> {
    const branchId = requireBranch(ctx);
    const { start, end } = getDayRangeInTimeZone(new Date(), CLINIC_TIMEZONE);
    return await db.select().from(appointments)
      .leftJoin(patients, eq(appointments.patientId, patients.id))
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .leftJoin(users, eq(appointments.veterinarianId, users.id))
      .leftJoin(staffMembers, eq(appointments.staffMemberId, staffMembers.id))
      .where(and(
        eq(appointments.organizationId, ctx.organizationId),
        eq(appointments.branchId, branchId),
        sql`${appointments.appointmentDate} >= ${start}`,
        sql`${appointments.appointmentDate} < ${end}`,
      ))
      .orderBy(asc(appointments.appointmentDate))
      .then((rows) => rows.map(this.mapAppt));
  }

  async createAppointment(ctx: TenantContext, appointment: InsertAppointment): Promise<Appointment> {
    const patient = await this.getPatient(ctx, appointment.patientId);
    if (!patient) throw new CrossTenantError("patient");
    const [created] = await db.insert(appointments).values({
      ...appointment,
      organizationId: ctx.organizationId,
      branchId: requireBranch(ctx),
      staffMemberId: ctx.staffMemberId ?? null,
      veterinarianId: null,
    }).returning();
    return created;
  }

  async updateAppointment(ctx: TenantContext, id: string, appointment: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const branchId = requireBranch(ctx);
    const { organizationId: _o, branchId: _b, ...patch } = appointment as any;
    if (patch.patientId) {
      const patient = await this.getPatient(ctx, patch.patientId);
      if (!patient) throw new CrossTenantError("patient");
    }
    const [updated] = await db.update(appointments)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(appointments.id, id), eq(appointments.organizationId, ctx.organizationId), eq(appointments.branchId, branchId)))
      .returning();
    return updated;
  }

  async deleteAppointment(ctx: TenantContext, id: string): Promise<void> {
    const branchId = requireBranch(ctx);
    await db.delete(appointments)
      .where(and(eq(appointments.id, id), eq(appointments.organizationId, ctx.organizationId), eq(appointments.branchId, branchId)));
  }

  // ---- Medical records ----
  private mapRecord = (row: any): MedicalRecordWithDetails => ({
    ...row.medical_records,
    patient: { ...row.patients!, owner: row.owners! },
    veterinarian: row.users ?? null,
    staffMember: row.staff_members ?? null,
  });

  async getMedicalRecords(ctx: TenantContext): Promise<MedicalRecordWithDetails[]> {
    const branchId = requireBranch(ctx);
    return await db.select().from(medicalRecords)
      .leftJoin(patients, eq(medicalRecords.patientId, patients.id))
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .leftJoin(users, eq(medicalRecords.veterinarianId, users.id))
      .leftJoin(staffMembers, eq(medicalRecords.veterinarianStaffMemberId, staffMembers.id))
      .where(and(eq(medicalRecords.organizationId, ctx.organizationId), eq(medicalRecords.branchId, branchId)))
      .orderBy(desc(medicalRecords.date))
      .then((rows) => rows.map(this.mapRecord));
  }

  async getMedicalRecord(ctx: TenantContext, id: string): Promise<MedicalRecordWithDetails | undefined> {
    const branchId = requireBranch(ctx);
    const [result] = await db.select().from(medicalRecords)
      .leftJoin(patients, eq(medicalRecords.patientId, patients.id))
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .leftJoin(users, eq(medicalRecords.veterinarianId, users.id))
      .leftJoin(staffMembers, eq(medicalRecords.veterinarianStaffMemberId, staffMembers.id))
      .where(and(eq(medicalRecords.id, id), eq(medicalRecords.organizationId, ctx.organizationId), eq(medicalRecords.branchId, branchId)));
    return result ? this.mapRecord(result) : undefined;
  }

  async getPatientMedicalRecords(ctx: TenantContext, patientId: string): Promise<MedicalRecordWithDetails[]> {
    const branchId = requireBranch(ctx);
    return await db.select().from(medicalRecords)
      .leftJoin(patients, eq(medicalRecords.patientId, patients.id))
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .leftJoin(users, eq(medicalRecords.veterinarianId, users.id))
      .leftJoin(staffMembers, eq(medicalRecords.veterinarianStaffMemberId, staffMembers.id))
      .where(and(eq(medicalRecords.patientId, patientId), eq(medicalRecords.organizationId, ctx.organizationId), eq(medicalRecords.branchId, branchId)))
      .orderBy(desc(medicalRecords.date))
      .then((rows) => rows.map(this.mapRecord));
  }

  async createMedicalRecord(ctx: TenantContext, record: InsertMedicalRecord): Promise<MedicalRecord> {
    const branchId = requireBranch(ctx);
    // Clinical author MUST be an active StaffMember tied to the acting user
    // (HQ #6): a record is never created with a null author.
    const staffMemberId = requireActiveStaff(ctx);
    const patient = await this.getPatient(ctx, record.patientId);
    if (!patient) throw new CrossTenantError("patient");
    if (record.appointmentId) {
      const appt = await this.getAppointment(ctx, record.appointmentId);
      if (!appt) throw new CrossTenantError("appointment");
    }
    // Author + branch are derived server-side (SEC-GAP-03), never from input.
    const [created] = await db.insert(medicalRecords).values({
      ...record,
      organizationId: ctx.organizationId,
      branchId,
      veterinarianStaffMemberId: staffMemberId,
      veterinarianId: null,
    }).returning();
    return created;
  }

  // ---- Treatments ----
  async getTreatments(ctx: TenantContext): Promise<Treatment[]> {
    return await db.select().from(treatments)
      .where(and(eq(treatments.organizationId, ctx.organizationId), eq(treatments.isActive, true)))
      .orderBy(asc(treatments.name));
  }

  async getTreatment(ctx: TenantContext, id: string): Promise<Treatment | undefined> {
    const [t] = await db.select().from(treatments)
      .where(and(eq(treatments.id, id), eq(treatments.organizationId, ctx.organizationId)));
    return t;
  }

  async createTreatment(ctx: TenantContext, treatment: InsertTreatment): Promise<Treatment> {
    const [created] = await db.insert(treatments)
      .values({ ...treatment, organizationId: ctx.organizationId }).returning();
    return created;
  }

  async updateTreatment(ctx: TenantContext, id: string, treatment: Partial<InsertTreatment>): Promise<Treatment | undefined> {
    const { organizationId: _o, ...patch } = treatment as any;
    const [updated] = await db.update(treatments)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(treatments.id, id), eq(treatments.organizationId, ctx.organizationId)))
      .returning();
    return updated;
  }

  async deleteTreatment(ctx: TenantContext, id: string): Promise<void> {
    await db.update(treatments).set({ isActive: false })
      .where(and(eq(treatments.id, id), eq(treatments.organizationId, ctx.organizationId)));
  }

  // ---- Invoices ----
  async getInvoices(ctx: TenantContext): Promise<InvoiceWithDetails[]> {
    const branchId = requireBranch(ctx);
    const rows = await db.select().from(invoices)
      .leftJoin(owners, eq(invoices.ownerId, owners.id))
      .leftJoin(patients, eq(invoices.patientId, patients.id))
      .where(and(eq(invoices.organizationId, ctx.organizationId), eq(invoices.branchId, branchId)))
      .orderBy(desc(invoices.issueDate));

    const result: InvoiceWithDetails[] = [];
    for (const invoice of rows) {
      const items = await db.select().from(invoiceItems)
        .leftJoin(treatments, eq(invoiceItems.treatmentId, treatments.id))
        .where(and(eq(invoiceItems.invoiceId, invoice.invoices.id), eq(invoiceItems.organizationId, ctx.organizationId)));
      result.push({
        ...invoice.invoices,
        owner: invoice.owners!,
        patient: invoice.patients || undefined,
        items: items.map((item) => ({ ...item.invoice_items, treatment: item.treatments || undefined })),
      });
    }
    return result;
  }

  async getInvoice(ctx: TenantContext, id: string): Promise<InvoiceWithDetails | undefined> {
    const branchId = requireBranch(ctx);
    const [invoiceResult] = await db.select().from(invoices)
      .leftJoin(owners, eq(invoices.ownerId, owners.id))
      .leftJoin(patients, eq(invoices.patientId, patients.id))
      .where(and(eq(invoices.id, id), eq(invoices.organizationId, ctx.organizationId), eq(invoices.branchId, branchId)));
    if (!invoiceResult) return undefined;

    const items = await db.select().from(invoiceItems)
      .leftJoin(treatments, eq(invoiceItems.treatmentId, treatments.id))
      .where(and(eq(invoiceItems.invoiceId, id), eq(invoiceItems.organizationId, ctx.organizationId)));

    return {
      ...invoiceResult.invoices,
      owner: invoiceResult.owners!,
      patient: invoiceResult.patients || undefined,
      items: items.map((item) => ({ ...item.invoice_items, treatment: item.treatments || undefined })),
    };
  }

  async getInvoiceByAppointment(ctx: TenantContext, appointmentId: string): Promise<Invoice | undefined> {
    const branchId = requireBranch(ctx);
    const [invoice] = await db.select().from(invoices)
      .where(and(eq(invoices.appointmentId, appointmentId), eq(invoices.organizationId, ctx.organizationId), eq(invoices.branchId, branchId)))
      .orderBy(desc(invoices.issueDate)).limit(1);
    return invoice;
  }

  async createInvoiceWithItems(ctx: TenantContext, input: CreateInvoiceInput): Promise<InvoiceWithDetails> {
    const org = ctx.organizationId;
    const branchId = requireBranch(ctx);

    const invoiceId = await db.transaction(async (tx) => {
      // Validate ALL references belong to this tenant. Any cross-tenant id
      // aborts the transaction → no invoice, no items, no stock change.
      const [owner] = await tx.select({ id: owners.id }).from(owners)
        .where(and(eq(owners.id, input.ownerId), eq(owners.organizationId, org))).limit(1);
      if (!owner) throw new CrossTenantError("owner");

      if (input.patientId) {
        const [p] = await tx.select({ id: patients.id }).from(patients)
          .where(and(eq(patients.id, input.patientId), eq(patients.organizationId, org))).limit(1);
        if (!p) throw new CrossTenantError("patient");
      }

      if (input.appointmentId) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.appointmentId}))`);
        const [appt] = await tx.select({ id: appointments.id }).from(appointments)
          .where(and(eq(appointments.id, input.appointmentId), eq(appointments.organizationId, org), eq(appointments.branchId, branchId))).limit(1);
        if (!appt) throw new CrossTenantError("appointment");
        const [existing] = await tx.select({ id: invoices.id }).from(invoices)
          .where(and(eq(invoices.appointmentId, input.appointmentId), eq(invoices.organizationId, org))).limit(1);
        if (existing) throw new Error("APPOINTMENT_ALREADY_INVOICED");
      }

      const productQty = new Map<string, number>();
      const resolvedItems = [] as { description: string; quantity: number; unitPrice: number; treatmentId?: string | null; inventoryItemId?: string | null }[];

      for (const it of input.items) {
        let unitPrice = it.unitPrice;
        if (it.treatmentId) {
          const [t] = await tx.select({ id: treatments.id }).from(treatments)
            .where(and(eq(treatments.id, it.treatmentId), eq(treatments.organizationId, org))).limit(1);
          if (!t) throw new CrossTenantError("treatment");
        }
        if (it.inventoryItemId) {
          const [product] = await tx.select({ price: inventoryItems.unitPrice }).from(inventoryItems)
            .where(and(eq(inventoryItems.id, it.inventoryItemId), eq(inventoryItems.organizationId, org), eq(inventoryItems.branchId, branchId))).limit(1);
          if (!product) throw new CrossTenantError("inventory");
          unitPrice = Number(product.price ?? 0);
          productQty.set(it.inventoryItemId, (productQty.get(it.inventoryItemId) ?? 0) + it.quantity);
        }
        resolvedItems.push({ ...it, unitPrice });
      }

      // Atomic, tenant-scoped stock decrement (blocks overselling).
      for (const [inventoryItemId, qty] of Array.from(productQty.entries())) {
        const [updated] = await tx.update(inventoryItems)
          .set({ currentStock: sql`coalesce(${inventoryItems.currentStock}, 0) - ${qty}`, updatedAt: new Date() })
          .where(and(
            eq(inventoryItems.id, inventoryItemId),
            eq(inventoryItems.organizationId, org),
            gte(sql`coalesce(${inventoryItems.currentStock}, 0)`, qty),
          ))
          .returning({ id: inventoryItems.id });
        if (!updated) throw new Error(`INSUFFICIENT_STOCK:${inventoryItemId}`);
      }

      const { subtotal, taxAmount, totalAmount } = computeInvoiceTotals(resolvedItems, input.taxRate ?? 0);
      const invoiceNumber = await reserveNextInvoiceNumber(tx);

      const [created] = await tx.insert(invoices).values({
        organizationId: org,
        branchId,
        invoiceNumber,
        ownerId: input.ownerId,
        patientId: input.patientId ?? null,
        appointmentId: input.appointmentId ?? null,
        dueDate: input.dueDate ?? null,
        notes: input.notes ?? null,
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        status: input.markPaid ? "paid" : "pending",
        paymentDate: input.markPaid ? new Date() : null,
        paymentMethod: input.markPaid ? (input.paymentMethod ?? null) : null,
      }).returning({ id: invoices.id });

      await tx.insert(invoiceItems).values(resolvedItems.map((it) => ({
        organizationId: org,
        branchId,
        invoiceId: created.id,
        treatmentId: it.treatmentId ?? null,
        inventoryItemId: it.inventoryItemId ?? null,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice.toFixed(2),
        totalPrice: computeInvoiceLineTotal(it).toFixed(2),
      })));

      return created.id;
    });

    const invoice = await this.getInvoice(ctx, invoiceId);
    if (!invoice) throw new Error("CREATED_INVOICE_NOT_FOUND");
    return invoice;
  }

  private async restoreStockForInvoice(tx: any, org: string, invoiceId: string): Promise<void> {
    const productLines = await tx.select({ inventoryItemId: invoiceItems.inventoryItemId, quantity: invoiceItems.quantity })
      .from(invoiceItems)
      .where(and(eq(invoiceItems.invoiceId, invoiceId), eq(invoiceItems.organizationId, org), isNotNull(invoiceItems.inventoryItemId)));
    const productQty = new Map<string, number>();
    for (const line of productLines) {
      if (!line.inventoryItemId) continue;
      productQty.set(line.inventoryItemId, (productQty.get(line.inventoryItemId) ?? 0) + (line.quantity ?? 0));
    }
    for (const [inventoryItemId, qty] of Array.from(productQty.entries())) {
      if (qty <= 0) continue;
      await tx.update(inventoryItems)
        .set({ currentStock: sql`coalesce(${inventoryItems.currentStock}, 0) + ${qty}`, updatedAt: new Date() })
        .where(and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.organizationId, org)));
    }
  }

  async updateInvoice(ctx: TenantContext, id: string, invoice: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const branchId = requireBranch(ctx);
    const { organizationId: _o, branchId: _b, ...patch } = invoice as any;
    return await db.transaction(async (tx) => {
      const [current] = await tx.select({ status: invoices.status }).from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.organizationId, ctx.organizationId), eq(invoices.branchId, branchId))).limit(1);
      if (!current) return undefined;

      const [updated] = await tx.update(invoices)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(invoices.id, id), eq(invoices.organizationId, ctx.organizationId), eq(invoices.branchId, branchId)))
        .returning();

      const wasCancelled = current?.status === "cancelled";
      const nowCancelled = updated?.status === "cancelled";
      if (nowCancelled && !wasCancelled) {
        await this.restoreStockForInvoice(tx, ctx.organizationId, id);
      }
      return updated;
    });
  }

  async deleteInvoice(ctx: TenantContext, id: string): Promise<void> {
    const branchId = requireBranch(ctx);
    await db.transaction(async (tx) => {
      const [current] = await tx.select({ status: invoices.status }).from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.organizationId, ctx.organizationId), eq(invoices.branchId, branchId))).limit(1);
      if (!current) return;
      if (current.status !== "cancelled") {
        await this.restoreStockForInvoice(tx, ctx.organizationId, id);
      }
      await tx.delete(invoiceItems).where(and(eq(invoiceItems.invoiceId, id), eq(invoiceItems.organizationId, ctx.organizationId)));
      await tx.delete(invoices).where(and(eq(invoices.id, id), eq(invoices.organizationId, ctx.organizationId), eq(invoices.branchId, branchId)));
    });
  }

  // ---- Inventory ----
  async getInventoryItems(ctx: TenantContext): Promise<InventoryItem[]> {
    const branchId = requireBranch(ctx);
    return await db.select().from(inventoryItems)
      .where(and(eq(inventoryItems.organizationId, ctx.organizationId), eq(inventoryItems.branchId, branchId), eq(inventoryItems.isActive, true)))
      .orderBy(asc(inventoryItems.name));
  }

  async getInventoryItem(ctx: TenantContext, id: string): Promise<InventoryItem | undefined> {
    const branchId = requireBranch(ctx);
    const [item] = await db.select().from(inventoryItems)
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.organizationId, ctx.organizationId), eq(inventoryItems.branchId, branchId)));
    return item;
  }

  async getLowStockItems(ctx: TenantContext): Promise<InventoryItem[]> {
    const branchId = requireBranch(ctx);
    return await db.select().from(inventoryItems)
      .where(and(
        eq(inventoryItems.organizationId, ctx.organizationId),
        eq(inventoryItems.branchId, branchId),
        eq(inventoryItems.isActive, true),
        sql`${inventoryItems.currentStock} <= ${inventoryItems.minStock}`,
      ))
      .orderBy(asc(inventoryItems.currentStock));
  }

  async createInventoryItem(ctx: TenantContext, item: InsertInventoryItem): Promise<InventoryItem> {
    const [created] = await db.insert(inventoryItems)
      .values({ ...item, organizationId: ctx.organizationId, branchId: requireBranch(ctx) }).returning();
    return created;
  }

  async updateInventoryItem(ctx: TenantContext, id: string, item: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    const branchId = requireBranch(ctx);
    const { organizationId: _o, branchId: _b, ...patch } = item as any;
    const [updated] = await db.update(inventoryItems)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.organizationId, ctx.organizationId), eq(inventoryItems.branchId, branchId)))
      .returning();
    return updated;
  }

  async deleteInventoryItem(ctx: TenantContext, id: string): Promise<void> {
    const branchId = requireBranch(ctx);
    await db.update(inventoryItems).set({ isActive: false })
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.organizationId, ctx.organizationId), eq(inventoryItems.branchId, branchId)));
  }

  // ---- Expenses ----
  async getExpenses(ctx: TenantContext, range?: { start: Date; end: Date }): Promise<ExpenseWithItem[]> {
    const branchId = requireBranch(ctx);
    const where = range
      ? and(eq(expenses.organizationId, ctx.organizationId), eq(expenses.branchId, branchId), sql`${expenses.date} >= ${range.start}`, sql`${expenses.date} < ${range.end}`)
      : and(eq(expenses.organizationId, ctx.organizationId), eq(expenses.branchId, branchId));
    const rows = await db.select().from(expenses)
      .leftJoin(inventoryItems, eq(expenses.inventoryItemId, inventoryItems.id))
      .where(where)
      .orderBy(desc(expenses.date));
    return rows.map((r) => ({ ...r.expenses, inventoryItem: r.inventory_items ?? null }));
  }

  async createExpense(ctx: TenantContext, input: CreateExpenseInput): Promise<Expense> {
    const org = ctx.organizationId;
    const branchId = requireBranch(ctx);
    return await db.transaction(async (tx) => {
      if (input.inventoryItemId && input.quantity && input.quantity > 0) {
        // Inventory lookup + stock update scoped to org+branch. A cross-tenant
        // item id yields NO expense and NO stock change (tx aborts).
        const [item] = await tx.select({ id: inventoryItems.id }).from(inventoryItems)
          .where(and(eq(inventoryItems.id, input.inventoryItemId), eq(inventoryItems.organizationId, org), eq(inventoryItems.branchId, branchId))).limit(1);
        if (!item) throw new CrossTenantError("inventory");
        await tx.update(inventoryItems)
          .set({ currentStock: sql`coalesce(${inventoryItems.currentStock}, 0) + ${input.quantity}`, updatedAt: new Date() })
          .where(and(eq(inventoryItems.id, input.inventoryItemId), eq(inventoryItems.organizationId, org)));
      }
      const [created] = await tx.insert(expenses).values({
        organizationId: org,
        branchId,
        date: input.date ?? new Date(),
        amount: input.amount.toFixed(2),
        category: input.category,
        description: input.description ?? null,
        supplier: input.supplier ?? null,
        paymentMethod: input.paymentMethod ?? null,
        inventoryItemId: input.inventoryItemId ?? null,
        quantity: input.quantity ?? null,
        notes: input.notes ?? null,
      }).returning();
      return created;
    });
  }

  async deleteExpense(ctx: TenantContext, id: string): Promise<void> {
    const branchId = requireBranch(ctx);
    await db.transaction(async (tx) => {
      const [expense] = await tx.select({ inventoryItemId: expenses.inventoryItemId, quantity: expenses.quantity }).from(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.organizationId, ctx.organizationId), eq(expenses.branchId, branchId))).limit(1);
      if (!expense) return;
      if (expense.inventoryItemId && expense.quantity && expense.quantity > 0) {
        await tx.update(inventoryItems)
          .set({ currentStock: sql`greatest(coalesce(${inventoryItems.currentStock}, 0) - ${expense.quantity}, 0)`, updatedAt: new Date() })
          .where(and(eq(inventoryItems.id, expense.inventoryItemId), eq(inventoryItems.organizationId, ctx.organizationId)));
      }
      await tx.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.organizationId, ctx.organizationId)));
    });
  }

  async getExpenseSummaryBetween(ctx: TenantContext, start: Date, end: Date) {
    const inRange = and(eq(expenses.organizationId, ctx.organizationId), sql`${expenses.date} >= ${start}`, sql`${expenses.date} < ${end}`);
    const byCategoryRows = await db.select({ category: expenses.category, total: sql<number>`COALESCE(sum(${expenses.amount}), 0)` })
      .from(expenses).where(inRange).groupBy(expenses.category);
    const byMethodRows = await db.select({ method: sql<string>`coalesce(${expenses.paymentMethod}, 'sin_especificar')`, total: sql<number>`COALESCE(sum(${expenses.amount}), 0)` })
      .from(expenses).where(inRange).groupBy(sql`coalesce(${expenses.paymentMethod}, 'sin_especificar')`);
    const byCategory = byCategoryRows.map((r) => ({ category: r.category, total: Number(r.total) }));
    const byMethod = byMethodRows.map((r) => ({ method: r.method, total: Number(r.total) }));
    const total = byCategory.reduce((s, c) => s + c.total, 0);
    const personal = byCategory.filter((c) => c.category === PERSONAL_CATEGORY).reduce((s, c) => s + c.total, 0);
    return { total, business: total - personal, personal, byCategory, byMethod };
  }

  // ---- Dashboard ----
  async getDashboardStats(ctx: TenantContext) {
    const now = new Date();
    const { start: startOfDay, end: endOfDay } = getDayRangeInTimeZone(now, CLINIC_TIMEZONE);
    const { start: startOfMonth, end: endOfMonth } = getMonthRangeInTimeZone(now, CLINIC_TIMEZONE);
    const org = ctx.organizationId;

    const [todayAppointmentsResult] = await db.select({ count: sql<number>`count(*)` }).from(appointments)
      .where(and(eq(appointments.organizationId, org), sql`${appointments.appointmentDate} >= ${startOfDay}`, sql`${appointments.appointmentDate} < ${endOfDay}`));
    const [activePatientsResult] = await db.select({ count: sql<number>`count(*)` }).from(patients)
      .where(and(eq(patients.organizationId, org), eq(patients.isActive, true)));
    const [monthlyRevenueResult] = await db.select({ total: sql<number>`COALESCE(sum(${invoices.totalAmount}), 0)` }).from(invoices)
      .where(and(eq(invoices.organizationId, org), sql`${invoices.issueDate} >= ${startOfMonth}`, sql`${invoices.issueDate} < ${endOfMonth}`, eq(invoices.status, "paid")));
    const [lowStockResult] = await db.select({ count: sql<number>`count(*)` }).from(inventoryItems)
      .where(and(eq(inventoryItems.organizationId, org), eq(inventoryItems.isActive, true), sql`${inventoryItems.currentStock} <= ${inventoryItems.minStock}`));

    return {
      todayAppointments: Number(todayAppointmentsResult.count),
      activePatients: Number(activePatientsResult.count),
      monthlyRevenue: Number(monthlyRevenueResult.total),
      lowStock: Number(lowStockResult.count),
    };
  }

  async getRevenueBetween(ctx: TenantContext, start: Date, end: Date): Promise<number> {
    const [result] = await db.select({ total: sql<number>`COALESCE(sum(${invoices.totalAmount}), 0)` }).from(invoices)
      .where(and(eq(invoices.organizationId, ctx.organizationId), sql`${invoices.issueDate} >= ${start}`, sql`${invoices.issueDate} < ${end}`, eq(invoices.status, "paid")));
    return Number(result.total);
  }

  async getRevenueByMethodBetween(ctx: TenantContext, start: Date, end: Date): Promise<{ method: string; total: number }[]> {
    const rows = await db.select({ method: sql<string>`coalesce(${invoices.paymentMethod}, 'sin_especificar')`, total: sql<number>`COALESCE(sum(${invoices.totalAmount}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.organizationId, ctx.organizationId), sql`${invoices.issueDate} >= ${start}`, sql`${invoices.issueDate} < ${end}`, eq(invoices.status, "paid")))
      .groupBy(sql`coalesce(${invoices.paymentMethod}, 'sin_especificar')`);
    return rows.map((r) => ({ method: r.method, total: Number(r.total) }));
  }

  async getRecentActivity(ctx: TenantContext) {
    const org = ctx.organizationId;
    const result = await db.execute(sql`
      SELECT id, type, description, activity_user AS "user", activity_timestamp AS timestamp
      FROM (
        SELECT 'appointment-' || a.id AS id, 'info' AS type,
          'Nueva cita programada para ' || COALESCE(p.name, 'paciente') AS description,
          NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS activity_user,
          a.created_at AS activity_timestamp
        FROM appointments a
        LEFT JOIN patients p ON p.id = a.patient_id
        LEFT JOIN users u ON u.id = a.veterinarian_id
        WHERE a.organization_id = ${org}
        UNION ALL
        SELECT 'invoice-' || i.id, 'warning',
          'Factura ' || i.invoice_number || ' generada para ' || COALESCE(p.name, 'paciente'), NULL, i.created_at
        FROM invoices i LEFT JOIN patients p ON p.id = i.patient_id
        WHERE i.organization_id = ${org}
        UNION ALL
        SELECT 'patient-' || p.id, 'success', 'Nuevo paciente registrado: ' || p.name, NULL, p.created_at
        FROM patients p WHERE p.organization_id = ${org}
        UNION ALL
        SELECT 'owner-' || o.id, 'success', 'Nuevo propietario registrado: ' || o.first_name || ' ' || o.last_name, NULL, o.created_at
        FROM owners o WHERE o.organization_id = ${org}
        UNION ALL
        SELECT 'medical-record-' || m.id, 'success',
          'Expediente médico actualizado para ' || COALESCE(p.name, 'paciente'),
          NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), m.created_at
        FROM medical_records m
        LEFT JOIN patients p ON p.id = m.patient_id
        LEFT JOIN users u ON u.id = m.veterinarian_id
        WHERE m.organization_id = ${org}
      ) activities
      WHERE activity_timestamp IS NOT NULL
      ORDER BY activity_timestamp DESC
      LIMIT 6
    `);
    const rows = (result as any).rows ?? [];
    return rows.map((r: any) => ({
      id: r.id, type: r.type, description: r.description,
      user: r.user ?? null, timestamp: new Date(r.timestamp),
    }));
  }
}

export const storage = new DatabaseStorage();
