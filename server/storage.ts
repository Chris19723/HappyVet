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
import { eq, desc, and, lt, sql, asc } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Owner operations
  getOwners(): Promise<Owner[]>;
  getOwner(id: string): Promise<Owner | undefined>;
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
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
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
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

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

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async updateInvoice(id: string, invoice: Partial<InsertInvoice>): Promise<Invoice> {
    const [updated] = await db
      .update(invoices)
      .set({ ...invoice, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return updated;
  }

  async deleteInvoice(id: string): Promise<void> {
    await db.delete(invoices).where(eq(invoices.id, id));
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
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

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
      todayAppointments: todayAppointmentsResult.count,
      activePatients: activePatientsResult.count,
      monthlyRevenue: monthlyRevenueResult.total,
      lowStock: lowStockResult.count,
    };
  }
}

export const storage = new DatabaseStorage();
