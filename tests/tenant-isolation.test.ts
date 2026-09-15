/**
 * HA-FOUND-001 — tenant isolation + fail-closed authorization integration tests.
 *
 * Runs against a REAL local Postgres given via TEST_DATABASE_URL (never prod).
 * Skipped when TEST_DATABASE_URL is unset, so CI's pure-function `npm test`
 * stays green. Run locally with:
 *   TEST_DATABASE_URL=postgres://… npx vitest run tests/tenant-isolation.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;

// Ensure server modules bind to the test DB before they are imported.
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

run("tenant isolation (HA-FOUND-001)", () => {
  let storage: any;
  let resolveTenantContext: any;
  let TenantError: any;
  let CrossTenantError: any;
  let pool: any;
  let raw: pg.Client;

  const ids: Record<string, string> = {};
  let ctxA: any, ctxB: any;

  beforeAll(async () => {
    raw = new pg.Client({ connectionString: TEST_DB });
    await raw.connect();
    await raw.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");

    const { runMigrations } = await import("../scripts/migrate");
    await runMigrations({});

    const s = await import("../server/storage");
    storage = s.storage;
    CrossTenantError = s.CrossTenantError;
    const tc = await import("../server/tenantContext");
    resolveTenantContext = tc.resolveTenantContext;
    TenantError = tc.TenantError;
    pool = (await import("../server/db")).pool;

    // --- Seed tenants, users, memberships, staff ---
    const mkUser = async (key: string, email: string) => {
      const r = await raw.query(`INSERT INTO users (email) VALUES ($1) RETURNING id`, [email]);
      ids[key] = r.rows[0].id;
    };
    await mkUser("userA", "a@a.com");
    await mkUser("userB", "b@b.com");
    await mkUser("userNone", "none@x.com");
    await mkUser("userRevoked", "rev@x.com");
    await mkUser("userSuspended", "sus@x.com");
    await mkUser("userUnknownRole", "unk@x.com");
    await mkUser("userMulti", "multi@x.com");

    const mkOrg = async (key: string, name: string) => {
      const o = await raw.query(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [name]);
      ids[key] = o.rows[0].id;
      const b = await raw.query(`INSERT INTO branches (organization_id, name) VALUES ($1, $2) RETURNING id`, [o.rows[0].id, name + " HQ"]);
      ids[key + "Branch"] = b.rows[0].id;
    };
    await mkOrg("orgA", "Org A");
    await mkOrg("orgB", "Org B");

    const mkStaffMembership = async (org: string, user: string, role: string, status = "active") => {
      const st = await raw.query(`INSERT INTO staff_members (organization_id, user_id, display_name, role) VALUES ($1,$2,$3,$4) RETURNING id`, [ids[org], ids[user], role, role]);
      await raw.query(`INSERT INTO memberships (organization_id, user_id, role, status, staff_member_id) VALUES ($1,$2,$3,$4,$5)`, [ids[org], ids[user], role, status, st.rows[0].id]);
    };
    await mkStaffMembership("orgA", "userA", "admin");
    await mkStaffMembership("orgB", "userB", "admin");
    await mkStaffMembership("orgA", "userRevoked", "veterinarian", "revoked");
    await mkStaffMembership("orgA", "userSuspended", "veterinarian", "suspended");
    await mkStaffMembership("orgA", "userUnknownRole", "hacker"); // unrecognized role, active
    await mkStaffMembership("orgA", "userMulti", "admin");
    await mkStaffMembership("orgB", "userMulti", "admin"); // two active memberships

    ctxA = await resolveTenantContext(ids.userA);
    ctxB = await resolveTenantContext(ids.userB);

    // --- Seed domain data via storage (exercises the real tenant-scoped path) ---
    const seed = async (ctx: any, tag: string) => {
      const owner = await storage.createOwner(ctx, { firstName: tag, lastName: "Owner" });
      ids[tag + "Owner"] = owner.id;
      const patient = await storage.createPatient(ctx, { name: tag + "-pet", species: "Canino", ownerId: owner.id });
      ids[tag + "Patient"] = patient.id;
      const treatment = await storage.createTreatment(ctx, { name: tag + "-consulta", price: "100.00" });
      ids[tag + "Treatment"] = treatment.id;
      const inv = await storage.createInventoryItem(ctx, { name: tag + "-prod", currentStock: 10, unitPrice: "50.00" });
      ids[tag + "Inventory"] = inv.id;
      const appt = await storage.createAppointment(ctx, { patientId: patient.id, appointmentDate: new Date(), reason: "checkup" } as any);
      ids[tag + "Appointment"] = appt.id;
      const invoice = await storage.createInvoiceWithItems(ctx, { ownerId: owner.id, patientId: patient.id, items: [{ description: "svc", quantity: 1, unitPrice: 100 }] });
      ids[tag + "Invoice"] = invoice.id;
      const record = await storage.createMedicalRecord(ctx, { patientId: patient.id, diagnosis: tag + " dx" } as any);
      ids[tag + "Record"] = record.id;
      await storage.createExpense(ctx, { amount: 200, category: "operativo" });
    };
    await seed(ctxA, "A");
    await seed(ctxB, "B");
  }, 60000);

  afterAll(async () => {
    await raw?.end();
    await pool?.end();
  });

  // ---- Context resolution / membership states (fail closed) ----
  it("resolves a single active membership", async () => {
    expect(ctxA.organizationId).toBe(ids.orgA);
    expect(ctxA.role).toBe("admin");
    expect(ctxA.branchId).toBe(ids.orgABranch);
    expect(ctxA.staffMemberId).toBeTruthy();
  });

  it("denies a user with no membership", async () => {
    await expect(resolveTenantContext(ids.userNone)).rejects.toMatchObject({ code: "NO_ACTIVE_MEMBERSHIP" });
  });
  it("denies a revoked membership", async () => {
    await expect(resolveTenantContext(ids.userRevoked)).rejects.toMatchObject({ code: "NO_ACTIVE_MEMBERSHIP" });
  });
  it("denies a suspended membership", async () => {
    await expect(resolveTenantContext(ids.userSuspended)).rejects.toMatchObject({ code: "NO_ACTIVE_MEMBERSHIP" });
  });
  it("denies an unrecognized role (fail closed)", async () => {
    await expect(resolveTenantContext(ids.userUnknownRole)).rejects.toMatchObject({ code: "FORBIDDEN_UNKNOWN_ROLE" });
  });
  it("requires tenant selection with multiple active memberships", async () => {
    await expect(resolveTenantContext(ids.userMulti)).rejects.toMatchObject({ code: "TENANT_SELECTION_REQUIRED" });
  });

  // ---- Cross-tenant reads return nothing ----
  it("cannot read another tenant's owner/patient/invoice/inventory/appointment/record", async () => {
    expect(await storage.getOwner(ctxA, ids.BOwner)).toBeUndefined();
    expect(await storage.getPatient(ctxA, ids.BPatient)).toBeUndefined();
    expect(await storage.getInvoice(ctxA, ids.BInvoice)).toBeUndefined();
    expect(await storage.getInventoryItem(ctxA, ids.BInventory)).toBeUndefined();
    expect(await storage.getAppointment(ctxA, ids.BAppointment)).toBeUndefined();
    expect(await storage.getMedicalRecord(ctxA, ids.BRecord)).toBeUndefined();
  });

  it("lists only its own tenant's data", async () => {
    const ownersA = await storage.getOwners(ctxA);
    expect(ownersA.every((o: any) => o.organizationId === ids.orgA)).toBe(true);
    expect(ownersA.some((o: any) => o.id === ids.BOwner)).toBe(false);
  });

  // ---- Cross-tenant mutations are no-ops / rejected ----
  it("cannot update or delete another tenant's owner", async () => {
    const upd = await storage.updateOwner(ctxA, ids.BOwner, { firstName: "hacked" });
    expect(upd).toBeUndefined();
    await storage.deleteOwner(ctxA, ids.BOwner);
    expect(await storage.getOwner(ctxB, ids.BOwner)).toBeDefined(); // still there for B
  });

  it("cannot attach a patient to another tenant's owner", async () => {
    await expect(storage.createPatient(ctxA, { name: "x", species: "Canino", ownerId: ids.BOwner })).rejects.toBeInstanceOf(CrossTenantError);
  });

  it("cannot create an appointment for another tenant's patient", async () => {
    await expect(storage.createAppointment(ctxA, { patientId: ids.BPatient, appointmentDate: new Date(), reason: "x" } as any)).rejects.toBeInstanceOf(CrossTenantError);
  });

  it("cannot create a medical record for another tenant's patient", async () => {
    await expect(storage.createMedicalRecord(ctxA, { patientId: ids.BPatient, diagnosis: "x" } as any)).rejects.toBeInstanceOf(CrossTenantError);
  });

  it("invoice with cross-tenant owner creates nothing", async () => {
    const before = (await storage.getInvoices(ctxA)).length;
    await expect(storage.createInvoiceWithItems(ctxA, { ownerId: ids.BOwner, items: [{ description: "x", quantity: 1, unitPrice: 10 }] })).rejects.toBeInstanceOf(CrossTenantError);
    expect((await storage.getInvoices(ctxA)).length).toBe(before);
  });

  it("invoice with cross-tenant inventory changes no stock and creates nothing", async () => {
    const before = (await storage.getInvoices(ctxA)).length;
    const stockBefore = (await storage.getInventoryItem(ctxB, ids.BInventory)).currentStock;
    await expect(storage.createInvoiceWithItems(ctxA, {
      ownerId: ids.AOwner,
      items: [{ description: "prod", quantity: 1, unitPrice: 0, inventoryItemId: ids.BInventory }],
    })).rejects.toBeInstanceOf(CrossTenantError);
    expect((await storage.getInvoices(ctxA)).length).toBe(before);
    expect((await storage.getInventoryItem(ctxB, ids.BInventory)).currentStock).toBe(stockBefore);
  });

  it("expense against cross-tenant inventory creates no expense and no stock change", async () => {
    const stockBefore = (await storage.getInventoryItem(ctxB, ids.BInventory)).currentStock;
    const before = (await storage.getExpenses(ctxA)).length;
    await expect(storage.createExpense(ctxA, { amount: 10, category: "inventario", inventoryItemId: ids.BInventory, quantity: 1 })).rejects.toBeInstanceOf(CrossTenantError);
    expect((await storage.getExpenses(ctxA)).length).toBe(before);
    expect((await storage.getInventoryItem(ctxB, ids.BInventory)).currentStock).toBe(stockBefore);
  });

  // ---- Database-level defense (composite FK) ----
  it("rejects a cross-tenant relation at the database layer", async () => {
    await expect(
      raw.query(`INSERT INTO patients (organization_id, name, species, owner_id) VALUES ($1, 'x', 'Canino', $2)`, [ids.orgA, ids.BOwner])
    ).rejects.toBeTruthy();
  });

  // ---- Dashboard aggregates are tenant-scoped ----
  it("dashboard stats only reflect the caller's tenant", async () => {
    const statsA = await storage.getDashboardStats(ctxA);
    const statsB = await storage.getDashboardStats(ctxB);
    expect(statsA.activePatients).toBe(1);
    expect(statsB.activePatients).toBe(1);
  });

  // ---- Clinician display (HQ #7) ----
  it("exposes the acting StaffMember as the clinician on appointments and records", async () => {
    const appt = await storage.getAppointment(ctxA, ids.AAppointment);
    expect(appt.staffMember).toBeTruthy();
    expect(appt.staffMember.id).toBe(ctxA.staffMemberId);
    expect(typeof appt.staffMember.displayName).toBe("string");

    const rec = await storage.getMedicalRecord(ctxA, ids.ARecord);
    expect(rec.staffMember).toBeTruthy();
    expect(rec.staffMember.id).toBe(ctxA.staffMemberId);
    expect(rec.veterinarianStaffMemberId).toBe(ctxA.staffMemberId);
  });

  // ---- Global invoice numbering (HQ #1) ----
  it("issues globally-unique invoice folios across tenants (no per-org reset)", async () => {
    const invA = await storage.createInvoiceWithItems(ctxA, { ownerId: ids.AOwner, items: [{ description: "svc", quantity: 1, unitPrice: 10 }] });
    const invB = await storage.createInvoiceWithItems(ctxB, { ownerId: ids.BOwner, items: [{ description: "svc", quantity: 1, unitPrice: 10 }] });
    const a = await storage.getInvoice(ctxA, invA.id);
    const b = await storage.getInvoice(ctxB, invB.id);
    expect(a.invoiceNumber).toMatch(/^INV-\d{6}$/);
    expect(b.invoiceNumber).toMatch(/^INV-\d{6}$/);
    // Globally unique: the two folios never collide even across separate tenants.
    expect(a.invoiceNumber).not.toBe(b.invoiceNumber);
    // A single global unique constraint exists on invoice_number (not per-org).
    const uq = await raw.query(`
      SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_number_unique'`);
    expect(uq.rowCount).toBe(1);
    const perOrg = await raw.query(`SELECT 1 FROM pg_constraint WHERE conname = 'invoices_org_number_uq'`);
    expect(perOrg.rowCount).toBe(0);
  });

  // ---- Membership ↔ StaffMember identity integrity (HQ #6) ----
  it("rejects a Membership that references another user's StaffMember (DB layer)", async () => {
    // A StaffMember in orgA that belongs to userB (no membership yet).
    const foreignStaff = await raw.query(
      `INSERT INTO staff_members (organization_id, user_id, display_name, role) VALUES ($1,$2,'Foreign','veterinarian') RETURNING id`,
      [ids.orgA, ids.userB]);
    const foreignStaffId = foreignStaff.rows[0].id;
    // userNone tries to adopt userB's staff identity in orgA → composite FK rejects.
    await expect(
      raw.query(`INSERT INTO memberships (organization_id, user_id, role, status, staff_member_id) VALUES ($1,$2,'admin','active',$3)`,
        [ids.orgA, ids.userNone, foreignStaffId])
    ).rejects.toBeTruthy();
  });

  // ---- Clinical author must be active staff (HQ #6) ----
  it("refuses to author a medical record when the acting staff is inactive", async () => {
    const u = await raw.query(`INSERT INTO users (email) VALUES ('inactive-staff@x.com') RETURNING id`);
    const uid = u.rows[0].id;
    const st = await raw.query(
      `INSERT INTO staff_members (organization_id, user_id, display_name, role, status) VALUES ($1,$2,'Inactive','veterinarian','inactive') RETURNING id`,
      [ids.orgA, uid]);
    await raw.query(`INSERT INTO memberships (organization_id, user_id, role, status, staff_member_id) VALUES ($1,$2,'veterinarian','active',$3)`,
      [ids.orgA, uid, st.rows[0].id]);
    const ctx = await resolveTenantContext(uid);
    expect(ctx.staffMemberId).toBeNull(); // inactive staff is not usable as author
    await expect(
      storage.createMedicalRecord(ctx, { patientId: ids.APatient, diagnosis: "x" } as any)
    ).rejects.toMatchObject({ code: "STAFF_REQUIRED" });
  });

  // ---- Branch-owned reads/writes fail closed without a single Branch (HQ #3) ----
  it("fails closed on branch-owned operations when no single Branch resolves", async () => {
    const o = await raw.query(`INSERT INTO organizations (name) VALUES ('Org C') RETURNING id`);
    const orgC = o.rows[0].id;
    // Two active branches → branchId cannot be resolved to one.
    await raw.query(`INSERT INTO branches (organization_id, name) VALUES ($1,'C1'),($1,'C2')`, [orgC]);
    const u = await raw.query(`INSERT INTO users (email) VALUES ('c@x.com') RETURNING id`);
    const uid = u.rows[0].id;
    const st = await raw.query(`INSERT INTO staff_members (organization_id, user_id, display_name, role) VALUES ($1,$2,'C','admin') RETURNING id`, [orgC, uid]);
    await raw.query(`INSERT INTO memberships (organization_id, user_id, role, status, staff_member_id) VALUES ($1,$2,'admin','active',$3)`, [orgC, uid, st.rows[0].id]);
    const ctxC = await resolveTenantContext(uid);
    expect(ctxC.branchId).toBeNull();
    await expect(storage.getInventoryItems(ctxC)).rejects.toMatchObject({ code: "BRANCH_SELECTION_REQUIRED" });
    await expect(storage.getInvoices(ctxC)).rejects.toMatchObject({ code: "BRANCH_SELECTION_REQUIRED" });
    await expect(storage.getAppointments(ctxC)).rejects.toMatchObject({ code: "BRANCH_SELECTION_REQUIRED" });
  });

  // ---- Branch-aware FK: cross-branch relation rejected at the DB layer (HQ #3) ----
  it("rejects a cross-branch invoice_item→invoice relation at the database layer", async () => {
    // A second branch in orgA, plus an invoice_item pointing at A's invoice but
    // tagged with the wrong branch → the branch-aware composite FK rejects it.
    const b2 = await raw.query(`INSERT INTO branches (organization_id, name) VALUES ($1,'A-2') RETURNING id`, [ids.orgA]);
    await expect(
      raw.query(
        `INSERT INTO invoice_items (organization_id, branch_id, invoice_id, description, unit_price, total_price)
         VALUES ($1, $2, $3, 'x', '1.00', '1.00')`,
        [ids.orgA, b2.rows[0].id, ids.AInvoice])
    ).rejects.toBeTruthy();
  });
});
