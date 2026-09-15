/**
 * HA-FOUND-001 — initial tenant bootstrap.
 *
 * Creates the ONE initial Organization + Branch that legacy data will be
 * backfilled into. Names MUST be provided explicitly — this script refuses to
 * invent them (HQ rule). Optionally attaches a first admin Membership.
 *
 * IDEMPOTENT / STOP-SAFE (HQ #8): re-running with the SAME ORG_NAME reuses the
 * existing Organization/Branch/Membership instead of creating duplicates, so a
 * crashed-mid-way run can be safely repeated and never produces a duplicate
 * initial tenant.
 *
 * Roles (HQ #5): the recognized roles are `admin` and `veterinarian` only. The
 * first membership defaults to `admin` — NEVER to `owner`.
 *
 * Usage:
 *   ORG_NAME="…" BRANCH_NAME="…" [ADMIN_USER_ID=… ADMIN_ROLE=admin] \
 *     DATABASE_URL=… tsx scripts/bootstrap-tenant.ts
 *
 * Prints the organization_id and branch_id (feed them to the backfill).
 * NEVER run against production without explicit HQ authorization.
 */
import pg from "pg";
import { RECOGNIZED_ROLES } from "../server/tenantContext";

async function main() {
  const orgName = process.env.ORG_NAME?.trim();
  const branchName = process.env.BRANCH_NAME?.trim();
  const adminUserId = process.env.ADMIN_USER_ID?.trim();
  // HQ #5: default to `admin` (the initial privileged role), never `owner`.
  const adminRole = (process.env.ADMIN_ROLE?.trim() || "admin");

  if (!orgName || !branchName) {
    console.error("STOP: ORG_NAME and BRANCH_NAME are required. This script will not invent tenant identity.");
    process.exit(1);
  }
  if (adminUserId && !(RECOGNIZED_ROLES as readonly string[]).includes(adminRole)) {
    console.error(`STOP: ADMIN_ROLE '${adminRole}' is not a recognized role (${RECOGNIZED_ROLES.join(", ")}).`);
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL must be set"); process.exit(1); }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    // Serialize concurrent bootstraps of the same org name.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`ha_bootstrap_${orgName}`]);

    // ---- Organization (idempotent by name) ----
    let organizationId: string;
    let orgReused = false;
    const existingOrg = await client.query<{ id: string }>(
      `SELECT id FROM organizations WHERE name = $1 ORDER BY created_at ASC LIMIT 1`, [orgName]);
    if (existingOrg.rows[0]) {
      organizationId = existingOrg.rows[0].id;
      orgReused = true;
    } else {
      const org = await client.query<{ id: string }>(
        `INSERT INTO organizations (name, status) VALUES ($1, 'active') RETURNING id`, [orgName]);
      organizationId = org.rows[0].id;
    }

    // ---- Branch (idempotent by org + name) ----
    let branchId: string;
    let branchReused = false;
    const existingBranch = await client.query<{ id: string }>(
      `SELECT id FROM branches WHERE organization_id = $1 AND name = $2 ORDER BY created_at ASC LIMIT 1`,
      [organizationId, branchName]);
    if (existingBranch.rows[0]) {
      branchId = existingBranch.rows[0].id;
      branchReused = true;
    } else {
      const branch = await client.query<{ id: string }>(
        `INSERT INTO branches (organization_id, name, status) VALUES ($1, $2, 'active') RETURNING id`,
        [organizationId, branchName]);
      branchId = branch.rows[0].id;
    }

    // ---- Admin StaffMember + Membership (idempotent by org + user) ----
    let membershipId: string | null = null;
    let staffMemberId: string | null = null;
    if (adminUserId) {
      const existingStaff = await client.query<{ id: string }>(
        `SELECT id FROM staff_members WHERE organization_id = $1 AND user_id = $2 ORDER BY created_at ASC LIMIT 1`,
        [organizationId, adminUserId]);
      if (existingStaff.rows[0]) {
        staffMemberId = existingStaff.rows[0].id;
      } else {
        const staff = await client.query<{ id: string }>(
          `INSERT INTO staff_members (organization_id, user_id, display_name, role, status)
           VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
          [organizationId, adminUserId, orgName + " admin", adminRole]);
        staffMemberId = staff.rows[0].id;
      }

      const existingMembership = await client.query<{ id: string }>(
        `SELECT id FROM memberships WHERE organization_id = $1 AND user_id = $2 LIMIT 1`,
        [organizationId, adminUserId]);
      if (existingMembership.rows[0]) {
        membershipId = existingMembership.rows[0].id;
        // Ensure the membership points at the staff identity (idempotent link).
        await client.query(
          `UPDATE memberships SET staff_member_id = $1, role = $2, status = 'active', updated_at = now()
           WHERE id = $3 AND staff_member_id IS DISTINCT FROM $1`,
          [staffMemberId, adminRole, membershipId]);
      } else {
        const m = await client.query<{ id: string }>(
          `INSERT INTO memberships (organization_id, user_id, role, status, staff_member_id)
           VALUES ($1, $2, $3, 'active', $4) RETURNING id`,
          [organizationId, adminUserId, adminRole, staffMemberId]);
        membershipId = m.rows[0].id;
      }
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ organizationId, branchId, membershipId, staffMemberId, orgReused, branchReused }, null, 2));
    if (orgReused || branchReused) {
      console.log("\nNOTE: existing tenant identity reused (idempotent re-run) — no duplicate created.");
    }
    console.log(`\nNext: BACKFILL_ORG_ID=${organizationId} BACKFILL_BRANCH_ID=${branchId} tsx scripts/backfill-tenant.ts`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Bootstrap failed:", (e as Error).message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
