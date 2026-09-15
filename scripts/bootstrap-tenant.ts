/**
 * HA-FOUND-001 — initial tenant bootstrap.
 *
 * Creates the ONE initial Organization + Branch that legacy data will be
 * backfilled into. Names MUST be provided explicitly — this script refuses to
 * invent them (HQ rule). Optionally attaches a first admin Membership.
 *
 * Usage:
 *   ORG_NAME="…" BRANCH_NAME="…" [ADMIN_USER_ID=… ADMIN_ROLE=owner] \
 *     DATABASE_URL=… tsx scripts/bootstrap-tenant.ts
 *
 * Prints the created organization_id and branch_id (feed them to the backfill).
 * NEVER run against production without explicit HQ authorization.
 */
import pg from "pg";
import { RECOGNIZED_ROLES } from "../server/tenantContext";

async function main() {
  const orgName = process.env.ORG_NAME?.trim();
  const branchName = process.env.BRANCH_NAME?.trim();
  const adminUserId = process.env.ADMIN_USER_ID?.trim();
  const adminRole = (process.env.ADMIN_ROLE?.trim() || "owner");

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
    const org = await client.query<{ id: string }>(
      `INSERT INTO organizations (name, status) VALUES ($1, 'active') RETURNING id`, [orgName]);
    const organizationId = org.rows[0].id;
    const branch = await client.query<{ id: string }>(
      `INSERT INTO branches (organization_id, name, status) VALUES ($1, $2, 'active') RETURNING id`,
      [organizationId, branchName]);
    const branchId = branch.rows[0].id;

    let membershipId: string | null = null;
    let staffMemberId: string | null = null;
    if (adminUserId) {
      const staff = await client.query<{ id: string }>(
        `INSERT INTO staff_members (organization_id, user_id, display_name, role, status)
         VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
        [organizationId, adminUserId, orgName + " admin", adminRole]);
      staffMemberId = staff.rows[0].id;
      const m = await client.query<{ id: string }>(
        `INSERT INTO memberships (organization_id, user_id, role, status, staff_member_id)
         VALUES ($1, $2, $3, 'active', $4) RETURNING id`,
        [organizationId, adminUserId, adminRole, staffMemberId]);
      membershipId = m.rows[0].id;
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ organizationId, branchId, membershipId, staffMemberId }, null, 2));
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
