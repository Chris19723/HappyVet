import { sql, relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  date,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// HA-FOUND-001 — MULTI-TENANT FOUNDATION
//
// Tenant model (canonical DOMAIN_MODEL):
//   Organization (tenant root) -> Branch (physical site)
//   User (global identity) -> Membership -> Organization
//   Organization -> StaffMember (optional User link)
//
// Every tenant-owned table carries `organization_id`. Branch-scoped tables also
// carry `branch_id`. Composite UNIQUE(id, organization_id) on parent tables +
// composite FOREIGN KEYs on children make cross-tenant relations impossible at
// the database layer (defense in depth on top of app-layer tenant predicates).
// Tenant columns are NEVER accepted from the browser (see insert schemas).
// ============================================================================

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table — GLOBAL authentication identity. NOT tenant-owned.
// A user_id alone never implies authorization (authorization flows through
// Membership). users.role is retained ONLY for compatibility/rollback and is
// no longer the runtime authorization authority.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("veterinarian"), // LEGACY — not authoritative
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ---------------------------------------------------------------------------
// TENANT ROOT
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  status: varchar("status").notNull().default("active"), // active, suspended, archived
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const branches = pgTable(
  "branches",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull().references(() => organizations.id),
    name: varchar("name").notNull(),
    status: varchar("status").notNull().default("active"), // active, inactive, archived
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique("branches_id_org_uq").on(t.id, t.organizationId)],
);

// StaffMember: a person working for an Organization, whether or not they have
// login credentials. Tenant-owned. Does NOT itself grant authorization.
export const staffMembers = pgTable(
  "staff_members",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull().references(() => organizations.id),
    userId: varchar("user_id").references(() => users.id), // optional login identity
    displayName: varchar("display_name").notNull(),
    role: varchar("role"), // clinical/operational label (e.g. veterinarian) — not auth
    status: varchar("status").notNull().default("active"), // active, inactive, archived
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique("staff_members_id_org_uq").on(t.id, t.organizationId),
    // Structural target for the Membership↔StaffMember identity FK: a Membership
    // may only reference a StaffMember that belongs to the SAME user (HQ #6).
    unique("staff_members_id_user_uq").on(t.id, t.userId),
  ],
);

// Membership: connects a User to an Organization and is the AUTHORITATIVE
// source of tenant role/access state.
export const memberships = pgTable(
  "memberships",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull().references(() => organizations.id),
    userId: varchar("user_id").notNull().references(() => users.id),
    role: varchar("role").notNull(), // owner, admin, veterinarian, staff (recognized set)
    status: varchar("status").notNull().default("active"), // invited, active, suspended, revoked
    staffMemberId: varchar("staff_member_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique("memberships_user_org_uq").on(t.userId, t.organizationId),
    index("memberships_user_idx").on(t.userId),
    index("memberships_org_idx").on(t.organizationId),
    foreignKey({
      columns: [t.staffMemberId, t.organizationId],
      foreignColumns: [staffMembers.id, staffMembers.organizationId],
      name: "memberships_staff_org_fk",
    }),
    // Identity integrity: when a Membership links a StaffMember, that staff row
    // must belong to the SAME user as the Membership (HQ #6). MATCH SIMPLE means
    // this is only enforced when staffMemberId is set (both columns non-null).
    foreignKey({
      columns: [t.staffMemberId, t.userId],
      foreignColumns: [staffMembers.id, staffMembers.userId],
      name: "memberships_staff_user_fk",
    }),
  ],
);

// ---------------------------------------------------------------------------
// TENANT-OWNED DOMAIN TABLES
// ---------------------------------------------------------------------------

// Owners/Clients table — tenant-owned (organization).
export const owners = pgTable(
  "owners",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull().references(() => organizations.id),
    firstName: varchar("first_name").notNull(),
    lastName: varchar("last_name").notNull(),
    email: varchar("email"),
    phone: varchar("phone"),
    address: text("address"),
    city: varchar("city"),
    postalCode: varchar("postal_code"),
    photoUrl: varchar("photo_url"),
    notes: text("notes"),
    isPublic: boolean("is_public").default(false), // walk-in "Público General" per org
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique("owners_id_org_uq").on(t.id, t.organizationId),
    index("owners_org_idx").on(t.organizationId),
  ],
);

// Patients/Pets table — tenant-owned. Owner must belong to same organization
// (enforced by composite FK).
export const patients = pgTable(
  "patients",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull().references(() => organizations.id),
    name: varchar("name").notNull(),
    species: varchar("species").notNull(),
    breed: varchar("breed"),
    color: varchar("color"),
    gender: varchar("gender"),
    birthDate: date("birth_date"),
    weight: decimal("weight", { precision: 5, scale: 2 }),
    microchipId: varchar("microchip_id"),
    ownerId: varchar("owner_id").notNull(),
    isActive: boolean("is_active").default(true),
    photoUrl: varchar("photo_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique("patients_id_org_uq").on(t.id, t.organizationId),
    index("patients_org_idx").on(t.organizationId),
    foreignKey({
      columns: [t.ownerId, t.organizationId],
      foreignColumns: [owners.id, owners.organizationId],
      name: "patients_owner_org_fk",
    }),
  ],
);

// Appointments table — tenant-owned + branch-scoped.
export const appointments = pgTable(
  "appointments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull().references(() => organizations.id),
    branchId: varchar("branch_id").notNull(),
    patientId: varchar("patient_id").notNull(),
    veterinarianId: varchar("veterinarian_id").references(() => users.id), // LEGACY, nullable
    staffMemberId: varchar("staff_member_id"), // tenant-owned clinician identity
    appointmentDate: timestamp("appointment_date").notNull(),
    duration: integer("duration").default(30),
    reason: text("reason").notNull(),
    status: varchar("status").default("scheduled"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique("appointments_id_org_uq").on(t.id, t.organizationId),
    unique("appointments_id_org_branch_uq").on(t.id, t.organizationId, t.branchId),
    index("appointments_org_idx").on(t.organizationId),
    foreignKey({
      columns: [t.branchId, t.organizationId],
      foreignColumns: [branches.id, branches.organizationId],
      name: "appointments_branch_org_fk",
    }),
    foreignKey({
      columns: [t.patientId, t.organizationId],
      foreignColumns: [patients.id, patients.organizationId],
      name: "appointments_patient_org_fk",
    }),
    foreignKey({
      columns: [t.staffMemberId, t.organizationId],
      foreignColumns: [staffMembers.id, staffMembers.organizationId],
      name: "appointments_staff_org_fk",
    }),
  ],
);

// Medical Records table — tenant-owned + branch context. Author is a tenant
// StaffMember (server-derived), not client input. Legacy veterinarian_id kept.
export const medicalRecords = pgTable(
  "medical_records",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull().references(() => organizations.id),
    branchId: varchar("branch_id").notNull(),
    patientId: varchar("patient_id").notNull(),
    veterinarianId: varchar("veterinarian_id").references(() => users.id), // LEGACY, nullable
    veterinarianStaffMemberId: varchar("veterinarian_staff_member_id"), // author (tenant)
    appointmentId: varchar("appointment_id"),
    date: timestamp("date").defaultNow(),
    diagnosis: text("diagnosis"),
    treatment: text("treatment"),
    prescription: text("prescription"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("medical_records_org_idx").on(t.organizationId),
    foreignKey({
      columns: [t.patientId, t.organizationId],
      foreignColumns: [patients.id, patients.organizationId],
      name: "medical_records_patient_org_fk",
    }),
    // Branch-aware: a record's appointment (when set) must share org + branch.
    foreignKey({
      columns: [t.appointmentId, t.organizationId, t.branchId],
      foreignColumns: [appointments.id, appointments.organizationId, appointments.branchId],
      name: "medical_records_appointment_org_branch_fk",
    }),
    foreignKey({
      columns: [t.branchId, t.organizationId],
      foreignColumns: [branches.id, branches.organizationId],
      name: "medical_records_branch_org_fk",
    }),
    foreignKey({
      columns: [t.veterinarianStaffMemberId, t.organizationId],
      foreignColumns: [staffMembers.id, staffMembers.organizationId],
      name: "medical_records_staff_org_fk",
    }),
  ],
);

// Treatments/Services catalog — tenant-owned.
export const treatments = pgTable(
  "treatments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull().references(() => organizations.id),
    name: varchar("name").notNull(),
    description: text("description"),
    price: decimal("price", { precision: 8, scale: 2 }).notNull(),
    duration: integer("duration"),
    category: varchar("category"),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique("treatments_id_org_uq").on(t.id, t.organizationId),
    index("treatments_org_idx").on(t.organizationId),
  ],
);

// Inventory Items — tenant-owned + branch stock scope.
export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull().references(() => organizations.id),
    branchId: varchar("branch_id").notNull(),
    name: varchar("name").notNull(),
    description: text("description"),
    category: varchar("category"),
    currentStock: integer("current_stock").default(0),
    minStock: integer("min_stock").default(5),
    unitPrice: decimal("unit_price", { precision: 8, scale: 2 }),
    supplier: varchar("supplier"),
    expiryDate: date("expiry_date"),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique("inventory_items_id_org_uq").on(t.id, t.organizationId),
    unique("inventory_items_id_org_branch_uq").on(t.id, t.organizationId, t.branchId),
    index("inventory_items_org_idx").on(t.organizationId),
    foreignKey({
      columns: [t.branchId, t.organizationId],
      foreignColumns: [branches.id, branches.organizationId],
      name: "inventory_items_branch_org_fk",
    }),
  ],
);

// Invoices — tenant-owned + branch context.
export const invoices = pgTable(
  "invoices",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull().references(() => organizations.id),
    branchId: varchar("branch_id").notNull(),
    invoiceNumber: varchar("invoice_number").notNull().unique(), // GLOBAL uniqueness (HQ HA-FOUND-001)
    ownerId: varchar("owner_id").notNull(),
    patientId: varchar("patient_id"),
    appointmentId: varchar("appointment_id"),
    issueDate: timestamp("issue_date").defaultNow(),
    dueDate: timestamp("due_date"),
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
    taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0"),
    totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
    status: varchar("status").default("pending"),
    paymentDate: timestamp("payment_date"),
    paymentMethod: varchar("payment_method"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique("invoices_id_org_uq").on(t.id, t.organizationId),
    unique("invoices_id_org_branch_uq").on(t.id, t.organizationId, t.branchId),
    index("invoices_org_idx").on(t.organizationId),
    foreignKey({
      columns: [t.branchId, t.organizationId],
      foreignColumns: [branches.id, branches.organizationId],
      name: "invoices_branch_org_fk",
    }),
    foreignKey({
      columns: [t.ownerId, t.organizationId],
      foreignColumns: [owners.id, owners.organizationId],
      name: "invoices_owner_org_fk",
    }),
    foreignKey({
      columns: [t.patientId, t.organizationId],
      foreignColumns: [patients.id, patients.organizationId],
      name: "invoices_patient_org_fk",
    }),
    // Branch-aware: an invoice's appointment (when set) must share org + branch.
    foreignKey({
      columns: [t.appointmentId, t.organizationId, t.branchId],
      foreignColumns: [appointments.id, appointments.organizationId, appointments.branchId],
      name: "invoices_appointment_org_branch_fk",
    }),
  ],
);

// Invoice Items — organization_id/branch_id derive from parent Invoice only.
export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull().references(() => organizations.id),
    branchId: varchar("branch_id").notNull(),
    invoiceId: varchar("invoice_id").notNull(),
    treatmentId: varchar("treatment_id"),
    inventoryItemId: varchar("inventory_item_id"),
    description: text("description").notNull(),
    quantity: integer("quantity").default(1),
    unitPrice: decimal("unit_price", { precision: 8, scale: 2 }).notNull(),
    totalPrice: decimal("total_price", { precision: 8, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("invoice_items_org_idx").on(t.organizationId),
    // Branch-aware: an item's invoice must share org + branch.
    foreignKey({
      columns: [t.invoiceId, t.organizationId, t.branchId],
      foreignColumns: [invoices.id, invoices.organizationId, invoices.branchId],
      name: "invoice_items_invoice_org_branch_fk",
    }),
    foreignKey({
      columns: [t.branchId, t.organizationId],
      foreignColumns: [branches.id, branches.organizationId],
      name: "invoice_items_branch_org_fk",
    }),
    foreignKey({
      columns: [t.treatmentId, t.organizationId],
      foreignColumns: [treatments.id, treatments.organizationId],
      name: "invoice_items_treatment_org_fk",
    }),
    // Branch-aware: an item's inventory item (when set) must share org + branch.
    foreignKey({
      columns: [t.inventoryItemId, t.organizationId, t.branchId],
      foreignColumns: [inventoryItems.id, inventoryItems.organizationId, inventoryItems.branchId],
      name: "invoice_items_inventory_org_branch_fk",
    }),
  ],
);

// Expenses / egresos — tenant-owned + branch-scoped.
export const expenses = pgTable(
  "expenses",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: varchar("organization_id").notNull().references(() => organizations.id),
    branchId: varchar("branch_id").notNull(),
    date: timestamp("date").defaultNow(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    category: varchar("category").notNull(),
    description: text("description"),
    supplier: varchar("supplier"),
    paymentMethod: varchar("payment_method"),
    inventoryItemId: varchar("inventory_item_id"),
    quantity: integer("quantity"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("expenses_org_idx").on(t.organizationId),
    foreignKey({
      columns: [t.branchId, t.organizationId],
      foreignColumns: [branches.id, branches.organizationId],
      name: "expenses_branch_org_fk",
    }),
    // Branch-aware: an expense's inventory item (when set) must share org + branch.
    foreignKey({
      columns: [t.inventoryItemId, t.organizationId, t.branchId],
      foreignColumns: [inventoryItems.id, inventoryItems.organizationId, inventoryItems.branchId],
      name: "expenses_inventory_org_branch_fk",
    }),
  ],
);

// ---------------------------------------------------------------------------
// Relations (ORM convenience — not a security boundary)
// ---------------------------------------------------------------------------
export const organizationsRelations = relations(organizations, ({ many }) => ({
  branches: many(branches),
  memberships: many(memberships),
  staffMembers: many(staffMembers),
}));

export const branchesRelations = relations(branches, ({ one }) => ({
  organization: one(organizations, { fields: [branches.organizationId], references: [organizations.id] }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, { fields: [memberships.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const staffMembersRelations = relations(staffMembers, ({ one }) => ({
  organization: one(organizations, { fields: [staffMembers.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [staffMembers.userId], references: [users.id] }),
}));

export const ownersRelations = relations(owners, ({ many }) => ({
  patients: many(patients),
  invoices: many(invoices),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  owner: one(owners, { fields: [patients.ownerId], references: [owners.id] }),
  appointments: many(appointments),
  medicalRecords: many(medicalRecords),
  invoices: many(invoices),
}));

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  patient: one(patients, { fields: [appointments.patientId], references: [patients.id] }),
  veterinarian: one(users, { fields: [appointments.veterinarianId], references: [users.id] }),
  medicalRecords: many(medicalRecords),
  invoices: many(invoices),
}));

export const medicalRecordsRelations = relations(medicalRecords, ({ one }) => ({
  patient: one(patients, { fields: [medicalRecords.patientId], references: [patients.id] }),
  veterinarian: one(users, { fields: [medicalRecords.veterinarianId], references: [users.id] }),
  appointment: one(appointments, { fields: [medicalRecords.appointmentId], references: [appointments.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  owner: one(owners, { fields: [invoices.ownerId], references: [owners.id] }),
  patient: one(patients, { fields: [invoices.patientId], references: [patients.id] }),
  appointment: one(appointments, { fields: [invoices.appointmentId], references: [appointments.id] }),
  items: many(invoiceItems),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
  treatment: one(treatments, { fields: [invoiceItems.treatmentId], references: [treatments.id] }),
  inventoryItem: one(inventoryItems, { fields: [invoiceItems.inventoryItemId], references: [inventoryItems.id] }),
}));

export const treatmentsRelations = relations(treatments, ({ many }) => ({
  invoiceItems: many(invoiceItems),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
}));

// ---------------------------------------------------------------------------
// Insert schemas — tenant ownership + server-derived fields are OMITTED so the
// browser can never set them (HA-I16 / server-derived ownership).
// ---------------------------------------------------------------------------
export const insertOwnerSchema = createInsertSchema(owners).omit({
  id: true, organizationId: true, isPublic: true, createdAt: true, updatedAt: true,
});

export const insertPatientSchema = createInsertSchema(patients).omit({
  id: true, organizationId: true, createdAt: true, updatedAt: true,
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true, organizationId: true, branchId: true, veterinarianId: true, staffMemberId: true, createdAt: true, updatedAt: true,
});

export const insertMedicalRecordSchema = createInsertSchema(medicalRecords).omit({
  id: true, organizationId: true, branchId: true, veterinarianId: true, veterinarianStaffMemberId: true, createdAt: true, updatedAt: true,
});

export const insertTreatmentSchema = createInsertSchema(treatments).omit({
  id: true, organizationId: true, createdAt: true, updatedAt: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true, organizationId: true, branchId: true, invoiceNumber: true, createdAt: true, updatedAt: true,
});

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({
  id: true, organizationId: true, branchId: true, createdAt: true,
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true, organizationId: true, branchId: true, createdAt: true, updatedAt: true,
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true, organizationId: true, branchId: true, createdAt: true, updatedAt: true,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;
export type Branch = typeof branches.$inferSelect;
export type InsertBranch = typeof branches.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type InsertMembership = typeof memberships.$inferInsert;
export type StaffMember = typeof staffMembers.$inferSelect;
export type InsertStaffMember = typeof staffMembers.$inferInsert;

export type InsertOwner = z.infer<typeof insertOwnerSchema>;
export type Owner = typeof owners.$inferSelect;

export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patients.$inferSelect;
export type PatientWithOwner = Patient & { owner: Owner };

export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type AppointmentWithDetails = Appointment & {
  patient: PatientWithOwner;
  veterinarian: User | null;
  staffMember: StaffMember | null; // tenant-owned clinician (preferred display)
};

export type InsertMedicalRecord = z.infer<typeof insertMedicalRecordSchema>;
export type MedicalRecord = typeof medicalRecords.$inferSelect;
export type MedicalRecordWithDetails = MedicalRecord & {
  patient: PatientWithOwner;
  veterinarian: User | null;
  staffMember: StaffMember | null; // tenant-owned clinician (preferred display)
};

export type InsertTreatment = z.infer<typeof insertTreatmentSchema>;
export type Treatment = typeof treatments.$inferSelect;

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceWithDetails = Invoice & {
  owner: Owner;
  patient?: Patient;
  items: (typeof invoiceItems.$inferSelect & { treatment?: Treatment })[];
};

export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type InvoiceItem = typeof invoiceItems.$inferSelect;

export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;

export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseWithItem = Expense & { inventoryItem?: InventoryItem | null };
