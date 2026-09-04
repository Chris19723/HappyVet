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
  type InsertInvoiceItem,
  type InventoryItem,
  type InsertInventoryItem,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, lt, sql, asc, gte, isNotNull } from "drizzle-orm";
import { computeInvoiceTotals, computeInvoiceLineTotal } from "@shared/invoice";
import { getDayRangeInTimeZone, getMonthRangeInTimeZone } from "@shared/time";

// The clinic's timezone anchors "today" / "this month" on the dashboard. The
// server runs in UTC in the cloud, so without this a late-evening appointment
// would roll into the next day. Configurable via CLINIC_TIMEZONE.
const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || "America/Mexico_City";

// Input for server-side invoice creation. Totals are NEVER taken from the
// client — they are computed here from the validated line items.
export interface CreateInvoiceInput {
  ownerId: string;
  patientId?: string | null;
  appointmentId?: string | null;
  dueDate?: Date | null;
  notes?: string | null;
  taxRate?: number; // 0..1 (e.g. 0.16 for 16% IVA)
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    treatmentId?: string | null;
    // When set, the line is an inventory product: its price comes from the
    // catalog (server-side) and stock is decremented on sale.
    inventoryItemId?: string | null;
  }[];
}

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Owner operations
  getOwners(): Promise<Owner[]>;
  getOwner(id: string): Promise<Owner | undefined>;
  getOrCreatePublicOwner(): Promise<Owner>;
  createOwner(owner: InsertOwner): Promise<Owner>;
  updateOwner(id: string, owner: Partial<InsertOwner>): Promise<Owner>;
  deleteOwner(id: string): Promise<void>;

  // Patient operations
  getPatients(): Promise<PatientWithOwner[]>;
  getPatient(id: string): Promise<PatientWithOwner | undefined>;
  getPatientsByOwner(ownerId: string): Promise<PatientWithOwner[]>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: string, patient: Partial<InsertPatient>): Promise<Patient>;
  deletePatient(id: string): Promise<void>;

  // Appointment operations
  getAppointments(): Promise<AppointmentWithDetails[]>;
  getAppointment(id: string): Promise<AppointmentWithDetails | undefined>;
  getTodayAppointments(): Promise<AppointmentWithDetails[]>;
  getUpcomingAppointments(): Promise<AppointmentWithDetails[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, appointment: Partial<InsertAppointment>): Promise<Appointment>;
  deleteAppointment(id: string): Promise<void>;

  // Medical record operations
  getMedicalRecords(): Promise<MedicalRecordWithDetails[]>;
  getMedicalRecord(id: string): Promise<MedicalRecordWithDetails | undefined>;
  getPatientMedicalRecords(patientId: string): Promise<MedicalRecordWithDetails[]>;
  createMedicalRecord(record: InsertMedicalRecord): Promise<MedicalRecord>;
  updateMedicalRecord(id: string, record: Partial<InsertMedicalRecord>): Promise<MedicalRecord>;
  deleteMedicalRecord(id: string): Promise<void>;

  // Treatment operations
  getTreatments(): Promise<Treatment[]>;
  getTreatment(id: string): Promise<Treatment | undefined>;
  createTreatment(treatment: InsertTreatment): Promise<Treatment>;
  updateTreatment(id: string, treatment: Partial<InsertTreatment>): Promise<Treatment>;
  deleteTreatment(id: string): Promise<void>;

  // Invoice operations
  getInvoices(): Promise<InvoiceWithDetails[]>;
  getInvoice(id: string): Promise<InvoiceWithDetails | undefined>;
  getInvoiceByAppointment(appointmentId: string): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice & Pick<Invoice, "invoiceNumber">): Promise<Invoice>;
  createInvoiceWithItems(input: CreateInvoiceInput): Promise<InvoiceWithDetails>;
  getNextInvoiceNumber(): Promise<string>;
  updateInvoice(id: string, invoice: Partial<InsertInvoice>): Promise<Invoice>;
  deleteInvoice(id: string): Promise<void>;
  addInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem>;

  // Inventory operations
  getInventoryItems(): Promise<InventoryItem[]>;
  getInventoryItem(id: string): Promise<InventoryItem | undefined>;
  getLowStockItems(): Promise<InventoryItem[]>;
  createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(id: string, item: Partial<InsertInventoryItem>): Promise<InventoryItem>;
  deleteInventoryItem(id: string): Promise<void>;

  // Dashboard statistics
  getDashboardStats(): Promise<{
    todayAppointments: number;
    activePatients: number;
    monthlyRevenue: number;
    lowStock: number;
  }>;
  getRecentActivity(): Promise<{
    id: string;
    type: "success" | "info" | "warning";
    description: string;
    user: string | null;
    timestamp: Date;
  }[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations (mandatory for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Owner operations
  async getOwners(): Promise<Owner[]> {
    return await db.select().from(owners).orderBy(asc(owners.lastName), asc(owners.firstName));
  }

  async getOwner(id: string): Promise<Owner | undefined> {
    const [owner] = await db.select().from(owners).where(eq(owners.id, id));
    return owner;
  }

  async createOwner(owner: InsertOwner): Promise<Owner> {
    const [created] = await db.insert(owners).values(owner).returning();
    return created;
  }

  // The generic walk-in customer for counter sales without a registered owner.
  // Created on first use so no seed/migration is needed.
  async getOrCreatePublicOwner(): Promise<Owner> {
    const [existing] = await db
      .select()
      .from(owners)
      .where(and(eq(owners.firstName, "Público"), eq(owners.lastName, "General")))
      .limit(1);
    if (existing) return existing;
    const [created] = await db
      .insert(owners)
      .values({ firstName: "Público", lastName: "General", notes: "Cliente genérico para ventas de mostrador" })
      .returning();
    return created;
  }

  async updateOwner(id: string, owner: Partial<InsertOwner>): Promise<Owner> {
    const [updated] = await db
      .update(owners)
      .set({ ...owner, updatedAt: new Date() })
      .where(eq(owners.id, id))
      .returning();
    return updated;
  }

  async deleteOwner(id: string): Promise<void> {
    await db.delete(owners).where(eq(owners.id, id));
  }

  // Patient operations
  async getPatients(): Promise<PatientWithOwner[]> {
    return await db
      .select()
      .from(patients)
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .where(eq(patients.isActive, true))
      .orderBy(asc(patients.name))
      .then(rows => 
        rows.map(row => ({
          ...row.patients,
          owner: row.owners!
        }))
      );
  }

  async getPatient(id: string): Promise<PatientWithOwner | undefined> {
    const [result] = await db
      .select()
      .from(patients)
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .where(eq(patients.id, id));
    
    if (!result) return undefined;
    
    return {
      ...result.patients,
      owner: result.owners!
    };
  }

  async getPatientsByOwner(ownerId: string): Promise<PatientWithOwner[]> {
    return await db
      .select()
      .from(patients)
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .where(and(eq(patients.ownerId, ownerId), eq(patients.isActive, true)))
      .orderBy(asc(patients.name))
      .then(rows => 
        rows.map(row => ({
          ...row.patients,
          owner: row.owners!
        }))
      );
  }

  async createPatient(patient: InsertPatient): Promise<Patient> {
    const [created] = await db.insert(patients).values(patient).returning();
    return created;
  }

  async updatePatient(id: string, patient: Partial<InsertPatient>): Promise<Patient> {
    const [updated] = await db
      .update(patients)
      .set({ ...patient, updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();
    return updated;
  }

  async deletePatient(id: string): Promise<void> {
    await db.update(patients).set({ isActive: false }).where(eq(patients.id, id));
  }

  // Appointment operations
  async getAppointments(): Promise<AppointmentWithDetails[]> {
    return await db
      .select()
      .from(appointments)
      .leftJoin(patients, eq(appointments.patientId, patients.id))
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .leftJoin(users, eq(appointments.veterinarianId, users.id))
      .orderBy(desc(appointments.appointmentDate))
      .then(rows =>
        rows.map(row => ({
          ...row.appointments,
          patient: {
            ...row.patients!,
            owner: row.owners!
          },
          veterinarian: row.users!
        }))
      );
  }

  async getAppointment(id: string): Promise<AppointmentWithDetails | undefined> {
    const [result] = await db
      .select()
      .from(appointments)
      .leftJoin(patients, eq(appointments.patientId, patients.id))
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .leftJoin(users, eq(appointments.veterinarianId, users.id))
      .where(eq(appointments.id, id));

    if (!result) return undefined;

    return {
      ...result.appointments,
      patient: {
        ...result.patients!,
        owner: result.owners!
      },
      veterinarian: result.users!
    };
  }

  async getTodayAppointments(): Promise<AppointmentWithDetails[]> {
    const { start: startOfDay, end: endOfDay } = getDayRangeInTimeZone(new Date(), CLINIC_TIMEZONE);

    return await db
      .select()
      .from(appointments)
      .leftJoin(patients, eq(appointments.patientId, patients.id))
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .leftJoin(users, eq(appointments.veterinarianId, users.id))
      .where(
        and(
          sql`${appointments.appointmentDate} >= ${startOfDay}`,
          sql`${appointments.appointmentDate} < ${endOfDay}`
        )
      )
      .orderBy(asc(appointments.appointmentDate))
      .then(rows =>
        rows.map(row => ({
          ...row.appointments,
          patient: {
            ...row.patients!,
            owner: row.owners!
          },
          veterinarian: row.users!
        }))
      );
  }

  async getUpcomingAppointments(): Promise<AppointmentWithDetails[]> {
    const now = new Date();
    
    return await db
      .select()
      .from(appointments)
      .leftJoin(patients, eq(appointments.patientId, patients.id))
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .leftJoin(users, eq(appointments.veterinarianId, users.id))
      .where(sql`${appointments.appointmentDate} > ${now}`)
      .orderBy(asc(appointments.appointmentDate))
      .limit(10)
      .then(rows =>
        rows.map(row => ({
          ...row.appointments,
          patient: {
            ...row.patients!,
            owner: row.owners!
          },
          veterinarian: row.users!
        }))
      );
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const [created] = await db.insert(appointments).values(appointment).returning();
    return created;
  }

  async updateAppointment(id: string, appointment: Partial<InsertAppointment>): Promise<Appointment> {
    const [updated] = await db
      .update(appointments)
      .set({ ...appointment, updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();
    return updated;
  }

  async deleteAppointment(id: string): Promise<void> {
    await db.delete(appointments).where(eq(appointments.id, id));
  }

  // Medical record operations
  async getMedicalRecords(): Promise<MedicalRecordWithDetails[]> {
    return await db
      .select()
      .from(medicalRecords)
      .leftJoin(patients, eq(medicalRecords.patientId, patients.id))
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .leftJoin(users, eq(medicalRecords.veterinarianId, users.id))
      .orderBy(desc(medicalRecords.date))
      .then(rows =>
        rows.map(row => ({
          ...row.medical_records,
          patient: {
            ...row.patients!,
            owner: row.owners!
          },
          veterinarian: row.users!
        }))
      );
  }

  async getMedicalRecord(id: string): Promise<MedicalRecordWithDetails | undefined> {
    const [result] = await db
      .select()
      .from(medicalRecords)
      .leftJoin(patients, eq(medicalRecords.patientId, patients.id))
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .leftJoin(users, eq(medicalRecords.veterinarianId, users.id))
      .where(eq(medicalRecords.id, id));

    if (!result) return undefined;

    return {
      ...result.medical_records,
      patient: {
        ...result.patients!,
        owner: result.owners!
      },
      veterinarian: result.users!
    };
  }

  async getPatientMedicalRecords(patientId: string): Promise<MedicalRecordWithDetails[]> {
    return await db
      .select()
      .from(medicalRecords)
      .leftJoin(patients, eq(medicalRecords.patientId, patients.id))
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .leftJoin(users, eq(medicalRecords.veterinarianId, users.id))
      .where(eq(medicalRecords.patientId, patientId))
      .orderBy(desc(medicalRecords.date))
      .then(rows =>
        rows.map(row => ({
          ...row.medical_records,
          patient: {
            ...row.patients!,
            owner: row.owners!
          },
          veterinarian: row.users!
        }))
      );
  }

  async createMedicalRecord(record: InsertMedicalRecord): Promise<MedicalRecord> {
    const [created] = await db.insert(medicalRecords).values(record).returning();
    return created;
  }

  async updateMedicalRecord(id: string, record: Partial<InsertMedicalRecord>): Promise<MedicalRecord> {
    const [updated] = await db
      .update(medicalRecords)  
      .set({ ...record, updatedAt: new Date() })
      .where(eq(medicalRecords.id, id))
      .returning();
    return updated;
  }

  async deleteMedicalRecord(id: string): Promise<void> {
    await db.delete(medicalRecords).where(eq(medicalRecords.id, id));
  }

  // Treatment operations
  async getTreatments(): Promise<Treatment[]> {
    return await db.select().from(treatments).where(eq(treatments.isActive, true)).orderBy(asc(treatments.name));
  }

  async getTreatment(id: string): Promise<Treatment | undefined> {
    const [treatment] = await db.select().from(treatments).where(eq(treatments.id, id));
    return treatment;
  }

  async createTreatment(treatment: InsertTreatment): Promise<Treatment> {
    const [created] = await db.insert(treatments).values(treatment).returning();
    return created;
  }

  async updateTreatment(id: string, treatment: Partial<InsertTreatment>): Promise<Treatment> {
    const [updated] = await db
      .update(treatments)
      .set({ ...treatment, updatedAt: new Date() })
      .where(eq(treatments.id, id))
      .returning();
    return updated;
  }

  async deleteTreatment(id: string): Promise<void> {
    await db.update(treatments).set({ isActive: false }).where(eq(treatments.id, id));
  }

  // Invoice operations
  async getInvoices(): Promise<InvoiceWithDetails[]> {
    const invoicesWithDetails = await db
      .select()
      .from(invoices)
      .leftJoin(owners, eq(invoices.ownerId, owners.id))
      .leftJoin(patients, eq(invoices.patientId, patients.id))
      .orderBy(desc(invoices.issueDate));

    const result: InvoiceWithDetails[] = [];
    
    for (const invoice of invoicesWithDetails) {
      const items = await db
        .select()
        .from(invoiceItems)
        .leftJoin(treatments, eq(invoiceItems.treatmentId, treatments.id))
        .where(eq(invoiceItems.invoiceId, invoice.invoices.id));

      result.push({
        ...invoice.invoices,
        owner: invoice.owners!,
        patient: invoice.patients || undefined,
        items: items.map(item => ({
          ...item.invoice_items,
          treatment: item.treatments || undefined
        }))
      });
    }

    return result;
  }

  async getInvoice(id: string): Promise<InvoiceWithDetails | undefined> {
    const [invoiceResult] = await db
      .select()
      .from(invoices)
      .leftJoin(owners, eq(invoices.ownerId, owners.id))
      .leftJoin(patients, eq(invoices.patientId, patients.id))
      .where(eq(invoices.id, id));

    if (!invoiceResult) return undefined;

    const items = await db
      .select()
      .from(invoiceItems)
      .leftJoin(treatments, eq(invoiceItems.treatmentId, treatments.id))
      .where(eq(invoiceItems.invoiceId, id));

    return {
      ...invoiceResult.invoices,
      owner: invoiceResult.owners!,
      patient: invoiceResult.patients || undefined,
      items: items.map(item => ({
        ...item.invoice_items,
        treatment: item.treatments || undefined
      }))
    };
  }

  async getInvoiceByAppointment(appointmentId: string): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.appointmentId, appointmentId))
      .orderBy(desc(invoices.issueDate))
      .limit(1);
    return invoice;
  }

  async createInvoice(invoice: InsertInvoice & Pick<Invoice, "invoiceNumber">): Promise<Invoice> {
    return await db.transaction(async (tx) => {
      if (invoice.appointmentId) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${invoice.appointmentId}))`);
        const [existingInvoice] = await tx
          .select({ id: invoices.id })
          .from(invoices)
          .where(eq(invoices.appointmentId, invoice.appointmentId))
          .limit(1);
        if (existingInvoice) {
          throw new Error("APPOINTMENT_ALREADY_INVOICED");
        }
      }

      const [created] = await tx.insert(invoices).values(invoice).returning();
      return created;
    });
  }

  // Sequential, collision-free invoice numbers backed by a Postgres sequence
  // (replaces `INV-${Date.now()}`, which can collide and isn't ordered).
  async getNextInvoiceNumber(): Promise<string> {
    await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1`);
    const result: any = await db.execute(
      sql`SELECT nextval('invoice_number_seq') AS nextval`
    );
    const next = result?.rows?.[0]?.nextval ?? Date.now();
    return `INV-${String(next).padStart(6, "0")}`;
  }

  // Creates an invoice + its items atomically, computing all totals server-side
  // so the client can never dictate the amount charged. Keeps the per-appointment
  // advisory lock that prevents double-billing the same appointment.
  async createInvoiceWithItems(input: CreateInvoiceInput): Promise<InvoiceWithDetails> {
    const invoiceId = await db.transaction(async (tx) => {
      if (input.appointmentId) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.appointmentId}))`);
        const [existing] = await tx
          .select({ id: invoices.id })
          .from(invoices)
          .where(eq(invoices.appointmentId, input.appointmentId))
          .limit(1);
        if (existing) {
          throw new Error("APPOINTMENT_ALREADY_INVOICED");
        }
      }

      // Resolve line prices: for inventory products, the price is the CATALOG
      // price (source of truth), never what the client sent. Services/manual
      // lines keep their given price. Also aggregate product quantities so a
      // product appearing in several lines is decremented once.
      const productQty = new Map<string, number>();
      const resolvedItems = [] as {
        description: string;
        quantity: number;
        unitPrice: number;
        treatmentId?: string | null;
        inventoryItemId?: string | null;
      }[];

      for (const it of input.items) {
        let unitPrice = it.unitPrice;
        if (it.inventoryItemId) {
          const [product] = await tx
            .select({ price: inventoryItems.unitPrice })
            .from(inventoryItems)
            .where(eq(inventoryItems.id, it.inventoryItemId))
            .limit(1);
          if (!product) {
            throw new Error(`INVENTORY_ITEM_NOT_FOUND:${it.inventoryItemId}`);
          }
          unitPrice = Number(product.price ?? 0);
          productQty.set(
            it.inventoryItemId,
            (productQty.get(it.inventoryItemId) ?? 0) + it.quantity
          );
        }
        resolvedItems.push({ ...it, unitPrice });
      }

      // Decrement stock atomically. The conditional UPDATE (only when enough
      // stock remains) blocks overselling even under concurrent sales.
      for (const [inventoryItemId, qty] of Array.from(productQty.entries())) {
        const [updated] = await tx
          .update(inventoryItems)
          .set({
            currentStock: sql`coalesce(${inventoryItems.currentStock}, 0) - ${qty}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(inventoryItems.id, inventoryItemId),
              gte(sql`coalesce(${inventoryItems.currentStock}, 0)`, qty)
            )
          )
          .returning({ id: inventoryItems.id });
        if (!updated) {
          throw new Error(`INSUFFICIENT_STOCK:${inventoryItemId}`);
        }
      }

      const { subtotal, taxAmount, totalAmount } = computeInvoiceTotals(
        resolvedItems,
        input.taxRate ?? 0
      );

      // Sequence lives in its own advisory lock so the first CREATE SEQUENCE
      // can't race across concurrent transactions.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('invoice_number_seq_init'))`);
      await tx.execute(sql`CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1`);
      const seq: any = await tx.execute(sql`SELECT nextval('invoice_number_seq') AS nextval`);
      const nextValue = seq?.rows?.[0]?.nextval;
      if (nextValue === undefined || nextValue === null) {
        throw new Error("INVOICE_SEQUENCE_UNAVAILABLE");
      }
      const invoiceNumber = `INV-${String(nextValue).padStart(6, "0")}`;

      const [created] = await tx
        .insert(invoices)
        .values({
          invoiceNumber,
          ownerId: input.ownerId,
          patientId: input.patientId ?? null,
          appointmentId: input.appointmentId ?? null,
          dueDate: input.dueDate ?? null,
          notes: input.notes ?? null,
          subtotal: subtotal.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          status: "pending",
        })
        .returning({ id: invoices.id });

      await tx.insert(invoiceItems).values(
        resolvedItems.map((it) => ({
          invoiceId: created.id,
          treatmentId: it.treatmentId ?? null,
          inventoryItemId: it.inventoryItemId ?? null,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice.toFixed(2),
          totalPrice: computeInvoiceLineTotal(it).toFixed(2),
        }))
      );

      return created.id;
    });

    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) {
      throw new Error("CREATED_INVOICE_NOT_FOUND");
    }
    return invoice;
  }

  // Return the product quantities of an invoice back to inventory. Stock is
  // considered "consumed" while an invoice is active and must be released
  // exactly once when the invoice is cancelled or deleted. Callers guard the
  // double-release by checking the invoice status transition, so this helper
  // just adds the quantities back.
  private async restoreStockForInvoice(tx: any, invoiceId: string): Promise<void> {
    const productLines = await tx
      .select({
        inventoryItemId: invoiceItems.inventoryItemId,
        quantity: invoiceItems.quantity,
      })
      .from(invoiceItems)
      .where(
        and(
          eq(invoiceItems.invoiceId, invoiceId),
          isNotNull(invoiceItems.inventoryItemId)
        )
      );

    // Aggregate so a product spread across several lines is restored once.
    const productQty = new Map<string, number>();
    for (const line of productLines) {
      if (!line.inventoryItemId) continue;
      productQty.set(
        line.inventoryItemId,
        (productQty.get(line.inventoryItemId) ?? 0) + (line.quantity ?? 0)
      );
    }

    for (const [inventoryItemId, qty] of Array.from(productQty.entries())) {
      if (qty <= 0) continue;
      await tx
        .update(inventoryItems)
        .set({
          currentStock: sql`coalesce(${inventoryItems.currentStock}, 0) + ${qty}`,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.id, inventoryItemId));
    }
  }

  async updateInvoice(id: string, invoice: Partial<InsertInvoice>): Promise<Invoice> {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: invoices.status })
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1);

      const [updated] = await tx
        .update(invoices)
        .set({ ...invoice, updatedAt: new Date() })
        .where(eq(invoices.id, id))
        .returning();

      // Release stock exactly once, on the transition INTO "cancelled" from a
      // non-cancelled state. Re-cancelling an already-cancelled invoice is a
      // no-op for inventory.
      const wasCancelled = current?.status === "cancelled";
      const nowCancelled = updated?.status === "cancelled";
      if (nowCancelled && !wasCancelled) {
        await this.restoreStockForInvoice(tx, id);
      }

      return updated;
    });
  }

  async deleteInvoice(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: invoices.status })
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1);

      // Only restore stock if it wasn't already released when the invoice was
      // cancelled — otherwise deleting a cancelled invoice would double-count.
      if (current && current.status !== "cancelled") {
        await this.restoreStockForInvoice(tx, id);
      }

      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      await tx.delete(invoices).where(eq(invoices.id, id));
    });
  }

  async addInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem> {
    const [created] = await db.insert(invoiceItems).values(item).returning();
    return created;
  }

  // Inventory operations
  async getInventoryItems(): Promise<InventoryItem[]> {
    return await db.select().from(inventoryItems).where(eq(inventoryItems.isActive, true)).orderBy(asc(inventoryItems.name));
  }

  async getInventoryItem(id: string): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    return item;
  }

  async getLowStockItems(): Promise<InventoryItem[]> {
    return await db
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.isActive, true),
          sql`${inventoryItems.currentStock} <= ${inventoryItems.minStock}`
        )
      )
      .orderBy(asc(inventoryItems.currentStock));
  }

  async createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem> {
    const [created] = await db.insert(inventoryItems).values(item).returning();
    return created;
  }

  async updateInventoryItem(id: string, item: Partial<InsertInventoryItem>): Promise<InventoryItem> {
    const [updated] = await db
      .update(inventoryItems)
      .set({ ...item, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning();
    return updated;
  }

  async deleteInventoryItem(id: string): Promise<void> {
    await db.update(inventoryItems).set({ isActive: false }).where(eq(inventoryItems.id, id));
  }

  // Dashboard statistics
  async getDashboardStats(): Promise<{
    todayAppointments: number;
    activePatients: number;
    monthlyRevenue: number;
    lowStock: number;
  }> {
    const now = new Date();
    const { start: startOfDay, end: endOfDay } = getDayRangeInTimeZone(now, CLINIC_TIMEZONE);
    const { start: startOfMonth, end: endOfMonth } = getMonthRangeInTimeZone(now, CLINIC_TIMEZONE);

    const [todayAppointmentsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(appointments)
      .where(
        and(
          sql`${appointments.appointmentDate} >= ${startOfDay}`,
          sql`${appointments.appointmentDate} < ${endOfDay}`
        )
      );

    const [activePatientsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(patients)
      .where(eq(patients.isActive, true));

    const [monthlyRevenueResult] = await db
      .select({ total: sql<number>`COALESCE(sum(${invoices.totalAmount}), 0)` })
      .from(invoices)
      .where(
        and(
          sql`${invoices.issueDate} >= ${startOfMonth}`,
          sql`${invoices.issueDate} < ${endOfMonth}`,
          eq(invoices.status, 'paid')
        )
      );

    const [lowStockResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.isActive, true),
          sql`${inventoryItems.currentStock} <= ${inventoryItems.minStock}`
        )
      );

    return {
      todayAppointments: Number(todayAppointmentsResult.count),
      activePatients: Number(activePatientsResult.count),
      monthlyRevenue: Number(monthlyRevenueResult.total),
      lowStock: Number(lowStockResult.count),
    };
  }

  async getRecentActivity(): Promise<{
    id: string;
    type: "success" | "info" | "warning";
    description: string;
    user: string | null;
    timestamp: Date;
  }[]> {
    const result = await db.execute(sql`
      SELECT id, type, description, activity_user AS "user", activity_timestamp AS timestamp
      FROM (
        SELECT
          'appointment-' || a.id AS id,
          'info' AS type,
          'Nueva cita programada para ' || COALESCE(p.name, 'paciente') AS description,
          NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS activity_user,
          a.created_at AS activity_timestamp
        FROM appointments a
        LEFT JOIN patients p ON p.id = a.patient_id
        LEFT JOIN users u ON u.id = a.veterinarian_id

        UNION ALL

        SELECT
          'invoice-' || i.id,
          'warning',
          'Factura ' || i.invoice_number || ' generada para ' || COALESCE(p.name, 'paciente'),
          NULL,
          i.created_at
        FROM invoices i
        LEFT JOIN patients p ON p.id = i.patient_id

        UNION ALL

        SELECT
          'patient-' || p.id,
          'success',
          'Nuevo paciente registrado: ' || p.name,
          NULL,
          p.created_at
        FROM patients p

        UNION ALL

        SELECT
          'owner-' || o.id,
          'success',
          'Nuevo propietario registrado: ' || o.first_name || ' ' || o.last_name,
          NULL,
          o.created_at
        FROM owners o

        UNION ALL

        SELECT
          'medical-record-' || m.id,
          'success',
          'Expediente médico actualizado para ' || COALESCE(p.name, 'paciente'),
          NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
          m.created_at
        FROM medical_records m
        LEFT JOIN patients p ON p.id = m.patient_id
        LEFT JOIN users u ON u.id = m.veterinarian_id
      ) activities
      WHERE activity_timestamp IS NOT NULL
      ORDER BY activity_timestamp DESC
      LIMIT 6
    `);

    return result.rows as {
      id: string;
      type: "success" | "info" | "warning";
      description: string;
      user: string | null;
      timestamp: Date;
    }[];
  }
}

export const storage = new DatabaseStorage();
