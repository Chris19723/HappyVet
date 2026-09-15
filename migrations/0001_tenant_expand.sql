-- HA-FOUND-001 — TENANT EXPAND (additive, safe on populated tables)
-- Creates tenant tables and adds NULLABLE tenant-ownership columns + the
-- composite UNIQUE keys required as targets for the composite FKs added in the
-- ENFORCE migration. No NOT NULL / FK enforcement here so this applies cleanly
-- before the backfill step.

-- ---- Tenant tables ----
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT 'active',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "branches" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" varchar NOT NULL,
  "name" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT 'active',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "branches_id_org_uq" UNIQUE ("id","organization_id"),
  CONSTRAINT "branches_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
);

CREATE TABLE IF NOT EXISTS "staff_members" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" varchar NOT NULL,
  "user_id" varchar,
  "display_name" varchar NOT NULL,
  "role" varchar,
  "status" varchar NOT NULL DEFAULT 'active',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "staff_members_id_org_uq" UNIQUE ("id","organization_id"),
  CONSTRAINT "staff_members_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id"),
  CONSTRAINT "staff_members_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id")
);

CREATE TABLE IF NOT EXISTS "memberships" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "role" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT 'active',
  "staff_member_id" varchar,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "memberships_user_org_uq" UNIQUE ("user_id","organization_id"),
  CONSTRAINT "memberships_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id"),
  CONSTRAINT "memberships_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
  CONSTRAINT "memberships_staff_org_fk" FOREIGN KEY ("staff_member_id","organization_id") REFERENCES "staff_members"("id","organization_id")
);
CREATE INDEX IF NOT EXISTS "memberships_user_idx" ON "memberships" ("user_id");
CREATE INDEX IF NOT EXISTS "memberships_org_idx" ON "memberships" ("organization_id");

-- ---- Tenant-ownership columns (NULLABLE for backfill) ----
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "organization_id" varchar;
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false;

ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "organization_id" varchar;

ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "organization_id" varchar;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "branch_id" varchar;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "staff_member_id" varchar;

ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "organization_id" varchar;
ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "branch_id" varchar;
ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "veterinarian_staff_member_id" varchar;

ALTER TABLE "treatments" ADD COLUMN IF NOT EXISTS "organization_id" varchar;

ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "organization_id" varchar;
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "branch_id" varchar;

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "organization_id" varchar;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "branch_id" varchar;

ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "organization_id" varchar;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "branch_id" varchar;

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "organization_id" varchar;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "branch_id" varchar;

-- Legacy author columns become nullable (new flow derives StaffMember author).
ALTER TABLE "appointments" ALTER COLUMN "veterinarian_id" DROP NOT NULL;
ALTER TABLE "medical_records" ALTER COLUMN "veterinarian_id" DROP NOT NULL;

-- Invoice numbers are unique PER ORGANIZATION, not globally. Drop the global
-- unique now; the composite (organization_id, invoice_number) unique is added
-- in ENFORCE once organization_id is backfilled.
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_invoice_number_unique";

-- ---- Composite UNIQUE keys on parent tables (FK targets). NULLs are distinct,
-- ---- so these are valid while organization_id is still being backfilled. ----
ALTER TABLE "owners" ADD CONSTRAINT "owners_id_org_uq" UNIQUE ("id","organization_id");
ALTER TABLE "patients" ADD CONSTRAINT "patients_id_org_uq" UNIQUE ("id","organization_id");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_id_org_uq" UNIQUE ("id","organization_id");
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_id_org_uq" UNIQUE ("id","organization_id");
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_id_org_uq" UNIQUE ("id","organization_id");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_id_org_uq" UNIQUE ("id","organization_id");

-- ---- Helpful tenant indexes ----
CREATE INDEX IF NOT EXISTS "owners_org_idx" ON "owners" ("organization_id");
CREATE INDEX IF NOT EXISTS "patients_org_idx" ON "patients" ("organization_id");
CREATE INDEX IF NOT EXISTS "appointments_org_idx" ON "appointments" ("organization_id");
CREATE INDEX IF NOT EXISTS "medical_records_org_idx" ON "medical_records" ("organization_id");
CREATE INDEX IF NOT EXISTS "treatments_org_idx" ON "treatments" ("organization_id");
CREATE INDEX IF NOT EXISTS "inventory_items_org_idx" ON "inventory_items" ("organization_id");
CREATE INDEX IF NOT EXISTS "invoices_org_idx" ON "invoices" ("organization_id");
CREATE INDEX IF NOT EXISTS "invoice_items_org_idx" ON "invoice_items" ("organization_id");
CREATE INDEX IF NOT EXISTS "expenses_org_idx" ON "expenses" ("organization_id");
