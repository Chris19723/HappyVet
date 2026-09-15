-- HA-FOUND-001 — TENANT ENFORCE (run AFTER bootstrap + backfill)
-- Locks in tenant ownership: NOT NULL on tenant columns, simple organization
-- FKs, and composite (id, organization_id) FKs that make cross-tenant
-- relations impossible at the database layer.

-- ---- NOT NULL on organization_id ----
ALTER TABLE "owners" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "patients" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "appointments" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "medical_records" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "treatments" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "inventory_items" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "invoice_items" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "organization_id" SET NOT NULL;

-- ---- NOT NULL on branch_id (all branch-scoped tables, medical_records included) ----
ALTER TABLE "appointments" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "medical_records" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "inventory_items" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "invoice_items" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "branch_id" SET NOT NULL;

-- ---- Simple organization FKs ----
ALTER TABLE "owners" ADD CONSTRAINT "owners_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
ALTER TABLE "patients" ADD CONSTRAINT "patients_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");

-- ---- Composite (child, organization) FKs → parent (id, organization_id) ----
ALTER TABLE "patients" ADD CONSTRAINT "patients_owner_org_fk"
  FOREIGN KEY ("owner_id","organization_id") REFERENCES "owners"("id","organization_id");

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_org_fk"
  FOREIGN KEY ("branch_id","organization_id") REFERENCES "branches"("id","organization_id");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_org_fk"
  FOREIGN KEY ("patient_id","organization_id") REFERENCES "patients"("id","organization_id");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staff_org_fk"
  FOREIGN KEY ("staff_member_id","organization_id") REFERENCES "staff_members"("id","organization_id");

ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_patient_org_fk"
  FOREIGN KEY ("patient_id","organization_id") REFERENCES "patients"("id","organization_id");
-- Branch-aware: a record's appointment (when set) must share org + branch.
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_appointment_org_branch_fk"
  FOREIGN KEY ("appointment_id","organization_id","branch_id") REFERENCES "appointments"("id","organization_id","branch_id");
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_branch_org_fk"
  FOREIGN KEY ("branch_id","organization_id") REFERENCES "branches"("id","organization_id");
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_staff_org_fk"
  FOREIGN KEY ("veterinarian_staff_member_id","organization_id") REFERENCES "staff_members"("id","organization_id");

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_branch_org_fk"
  FOREIGN KEY ("branch_id","organization_id") REFERENCES "branches"("id","organization_id");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branch_org_fk"
  FOREIGN KEY ("branch_id","organization_id") REFERENCES "branches"("id","organization_id");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_owner_org_fk"
  FOREIGN KEY ("owner_id","organization_id") REFERENCES "owners"("id","organization_id");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patient_org_fk"
  FOREIGN KEY ("patient_id","organization_id") REFERENCES "patients"("id","organization_id");
-- Branch-aware: an invoice's appointment (when set) must share org + branch.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_appointment_org_branch_fk"
  FOREIGN KEY ("appointment_id","organization_id","branch_id") REFERENCES "appointments"("id","organization_id","branch_id");

-- Branch-aware: an item's invoice must share org + branch.
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_org_branch_fk"
  FOREIGN KEY ("invoice_id","organization_id","branch_id") REFERENCES "invoices"("id","organization_id","branch_id");
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_branch_org_fk"
  FOREIGN KEY ("branch_id","organization_id") REFERENCES "branches"("id","organization_id");
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_treatment_org_fk"
  FOREIGN KEY ("treatment_id","organization_id") REFERENCES "treatments"("id","organization_id");
-- Branch-aware: an item's inventory item (when set) must share org + branch.
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_inventory_org_branch_fk"
  FOREIGN KEY ("inventory_item_id","organization_id","branch_id") REFERENCES "inventory_items"("id","organization_id","branch_id");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_org_fk"
  FOREIGN KEY ("branch_id","organization_id") REFERENCES "branches"("id","organization_id");
-- Branch-aware: an expense's inventory item (when set) must share org + branch.
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_inventory_org_branch_fk"
  FOREIGN KEY ("inventory_item_id","organization_id","branch_id") REFERENCES "inventory_items"("id","organization_id","branch_id");

-- Invoice numbers remain GLOBALLY unique (HQ HA-FOUND-001 PR #23 review #1); the
-- pre-tenant global unique "invoices_invoice_number_unique" is preserved. No
-- per-organization invoice-number constraint is added.
