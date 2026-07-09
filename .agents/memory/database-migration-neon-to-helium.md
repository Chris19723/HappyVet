---
name: Neon-to-Helium database migration
description: Why this project uses the node-postgres driver and what to do if DATABASE_URL breaks again
---

The original Neon database's credentials expired permanently ("password authentication failed for user 'neondb_owner'"). Replit's `createDatabase()` kept returning the same broken external DB because DATABASE_URL/PG* were stored as user-level Secrets pointing outside Replit's management — the agent cannot delete Secrets, only the user can (Secrets pane).

**Fix applied:** user deleted the DB secrets, created a Replit-managed Helium Postgres from the Database pane. Helium is standard Postgres, NOT Neon.

**Why:** `@neondatabase/serverless` (WebSocket driver) does not work with Helium. `server/db.ts` must use `pg` (default CommonJS import: `import pg from "pg"`) with `drizzle-orm/node-postgres`.

**How to apply:** If DB auth fails again, check whether DATABASE_URL is a Secret pointing to an external host; if so the user must delete it from Secrets and recreate via the Database pane. After a new DB: `npm run db:push` recreates the schema. `connect-pg-simple` `ttl` is in seconds, not ms.
