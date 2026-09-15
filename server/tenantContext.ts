/**
 * HA-FOUND-001 — server-derived TenantContext.
 *
 * Resolves the authenticated Replit identity into a tenant context. The browser
 * NEVER supplies organizationId/branchId/role — they are derived here.
 *
 *   authenticated User
 *     → active Membership   (0 → 403, >1 → 409, exactly 1 → resolve)
 *     → Organization
 *     → recognized Role     (unrecognized → 403, fail closed)
 *     → optional StaffMember
 *     → active Branch when a single one exists
 *
 * Authorization is fail-closed: absence/ambiguity denies. users.role and
 * ADMIN_EMAILS are NOT consulted here.
 */
import type { RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { memberships, branches } from "@shared/schema";

// Minimal recognized role set for the foundation. The fine-grained permission
// matrix is an OPEN canonical decision (ARCHITECTURE.md:554 / SECURITY_MODEL.md:503);
// this preserves the app's existing privileged/standard split, re-sourced from
// Membership and fail-closed. Unrecognized roles are denied.
export const RECOGNIZED_ROLES = ["owner", "admin", "veterinarian", "staff"] as const;
export type RecognizedRole = (typeof RECOGNIZED_ROLES)[number];
// Roles allowed to perform privileged/destructive & catalog-management actions.
export const PRIVILEGED_ROLES: RecognizedRole[] = ["owner", "admin"];

export interface TenantContext {
  userId: string;
  organizationId: string;
  membershipId: string;
  role: RecognizedRole;
  staffMemberId: string | null;
  /** Single active branch for the org, or null when 0 or >1 exist. */
  branchId: string | null;
}

export class TenantError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export async function resolveTenantContext(userId: string | undefined): Promise<TenantContext> {
  if (!userId) throw new TenantError(401, "UNAUTHORIZED", "Missing authenticated user");

  const active = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")));

  if (active.length === 0) {
    throw new TenantError(403, "NO_ACTIVE_MEMBERSHIP", "No active membership for user");
  }
  if (active.length > 1) {
    throw new TenantError(409, "TENANT_SELECTION_REQUIRED", "User has multiple active memberships");
  }

  const m = active[0];
  if (!(RECOGNIZED_ROLES as readonly string[]).includes(m.role)) {
    // Fail closed on unrecognized role.
    throw new TenantError(403, "FORBIDDEN_UNKNOWN_ROLE", `Unrecognized role: ${m.role}`);
  }

  // Resolve the org's single active branch (MVP is single-branch). Multiple or
  // zero active branches leaves branchId null; branch-scoped writes then fail
  // closed with BRANCH_SELECTION_REQUIRED at the point of use.
  const activeBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.organizationId, m.organizationId), eq(branches.status, "active")));

  const branchId = activeBranches.length === 1 ? activeBranches[0].id : null;

  return {
    userId,
    organizationId: m.organizationId,
    membershipId: m.id,
    role: m.role as RecognizedRole,
    staffMemberId: m.staffMemberId ?? null,
    branchId,
  };
}

/** Returns the context's branchId or throws if a single branch is required but not resolvable. */
export function requireBranch(ctx: TenantContext): string {
  if (!ctx.branchId) {
    throw new TenantError(409, "BRANCH_SELECTION_REQUIRED", "No single active branch resolved");
  }
  return ctx.branchId;
}

/** Fail-closed role gate for privileged/destructive actions. */
export function requireTenantRole(ctx: TenantContext, roles: RecognizedRole[]): void {
  if (!roles.includes(ctx.role)) {
    throw new TenantError(403, "FORBIDDEN_ROLE", `Requires role: ${roles.join(" or ")}`);
  }
}

/**
 * Express middleware: attaches req.tenant. Must run AFTER isAuthenticated.
 * On failure sends the mapped status/code and does not call next().
 */
export const withTenant: RequestHandler = async (req, res, next) => {
  try {
    const sub = (req as any).user?.claims?.sub as string | undefined;
    const ctx = await resolveTenantContext(sub);
    (req as any).tenant = ctx;
    next();
  } catch (err) {
    if (err instanceof TenantError) {
      return res.status(err.status).json({ message: err.message, code: err.code });
    }
    console.error("[tenantContext] resolution error:", (err as Error).message);
    return res.status(500).json({ message: "Tenant resolution failed" });
  }
};

export function getTenant(req: any): TenantContext {
  const ctx = req.tenant as TenantContext | undefined;
  if (!ctx) throw new TenantError(403, "NO_TENANT_CONTEXT", "Tenant context not resolved");
  return ctx;
}
