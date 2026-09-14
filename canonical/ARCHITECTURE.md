# HAPPY ANIMALS — ARCHITECTURE

STATUS: PHASE 0 BASELINE APPROVED — IMPLEMENTATION DETAILS OPEN
OWNER: 01-ARCHITECTURE
LAST UPDATED: 2026-09-14
GATE 0D: PASS

## PRINCIPLE

Usar la arquitectura mínima que soporte correctamente el producto.

No introducir sin una necesidad demostrable:

- microservices;
- Kafka;
- Kubernetes;
- Redis;
- external queues;
- vector DB;
- event sourcing;
- CQRS;
- MCP;
- A2A;
- autonomous agents.

## APPROVED BASELINE

MODULAR MONOLITH
+
TYPESCRIPT
+
POSTGRESQL
+
REST
+
EXPLICIT VALIDATION
+
STRUCTURED OBSERVABILITY.

### KEEP

Frontend candidate:
- React / Next.js / TypeScript;
- or React / Vite / TypeScript.

Backend:
- Node.js / TypeScript.

Database:
- PostgreSQL.

API:
- REST initially.

Validation:
- explicit validation at boundaries;
- Zod is a likely candidate, not yet frozen.

Observability:
- structured logs;
- error tracking;
- health checks;
- metrics where useful;
- audit logs.

### CURRENT IMPLEMENTATION / LONG-TERM DECISION SEPARATION

Verified current implementation uses:
- Drizzle ORM;
- Replit Auth / OIDC / Passport;
- PostgreSQL via `pg`.

These are CURRENT VERIFIED IMPLEMENTATION choices. They are not automatically permanent strategic commitments.

### DEFER

- final long-term ORM decision if evidence justifies changing from Drizzle;
- final long-term auth provider decision if evidence justifies changing from Replit Auth;
- payment provider;
- CFDI provider;
- object storage provider;
- messaging provider;
- deployment topology;
- exact n8n usage;
- exact backup provider / RPO / RTO.

### REJECT FOR CURRENT BASELINE

- microservices;
- Kafka;
- CQRS;
- event sourcing;
- vector DB / RAG infrastructure;
- MCP;
- A2A;
- autonomous agents.

## COMMERCIAL GEOGRAPHY PRINCIPLE

Initial commercial market:
MEXICO ONLY.

Architecture must remain internationalization-ready without building unused country functionality.

Preserve explicit boundaries for:
- currency;
- timezone;
- localization;
- payment providers;
- invoicing/tax providers;
- messaging providers.

Do not hardcode assumptions that make USA/Canada expansion require domain redesign.

Do not build USA/Canada compliance/localization now.

## TENANCY

Approved model:

Platform
└── Organization
    └── Branch

### Organization

Root tenant and commercial Happy Animals customer.

All tenant-owned clinical and operational data must resolve to exactly one Organization.

### Branch

Physical operating location.

Every Organization conceptually has at least one Branch.

Single-site customer:
Organization
→ Default Branch.

Branch exists from baseline for:
- appointment location;
- inventory location;
- staff scope;
- future multi-location compatibility.

Multi-location product workflows/UI are NOT initial MVP scope.

### Clinic

Do not create a separate persistence entity at baseline.

`Clinic` remains a product/business term represented by:
- Organization = business/customer;
- Branch = physical site.

Reopen only if discovery proves distinct semantics.

## TENANT ISOLATION

Tenant isolation must be enforced:
- server-side;
- in request context;
- in services/domain;
- in queries;
- with relational integrity constraints where practical;
- in tests;
- in audit.

UI filtering is never sufficient.

Cross-tenant references are prohibited unless explicitly modeled as platform-level data.

## IDENTITY / AUTHORIZATION

Approved conceptual separation:

User ≠ StaffMember ≠ Membership.

### User

Global authentication identity.

A User alone grants no tenant authorization.

### StaffMember

Person working for an Organization, whether or not login credentials currently exist.

### Membership

Connects User to Organization and carries access state / role / scope.

Candidate states:
- invited;
- active;
- suspended;
- revoked.

Baseline authorization flow:

User
→ active Membership
→ Organization
→ Role / Scope
→ Resource ownership
→ Action
→ Resource state
→ ALLOW / DENY.

Initial model:
RBAC + resource/tenant/state checks.

Full ABAC / policy engine:
DEFER.

Authorization:
SERVER-SIDE ONLY.

## CLINICAL DOMAIN BOUNDARY

### MedicalRecord

Longitudinal clinical aggregate/container for a Patient.

Not one freely mutable blob.

### Encounter / Consultation

Primary episodic clinical documentation unit.

Candidate state flow:

DRAFT
→ FINALIZED
→ AMENDMENT / CORRECTION.

Finalized content:
- cannot be silently overwritten;
- cannot be silently deleted;
- retains author;
- retains timestamp;
- retains amendment/correction history.

Clinical history integrity is a structural invariant.

## FINANCIAL BOUNDARIES

Keep conceptually separate:

1. clinical/service charge truth;
2. clinic invoice / internal ledger;
3. clinic payment record;
4. external payment processor;
5. CFDI / fiscal provider;
6. Happy Animals SaaS subscription billing.

### Rules

Charge ≠ Payment.

Clinic Invoice ≠ CFDI.

External processor is authoritative only for its own provider transaction/event facts.

Happy Animals clinic financial domain is authoritative for internal payment/invoice state after validated rules.

Preferred external payment event flow:

receive provider event
→ verify
→ deduplicate
→ persist evidence
→ apply domain transaction
→ update Payment / Invoice
→ audit.

Happy Animals SaaS subscription billing is a separate platform domain.

Payment provider must never become the product entitlement authorization engine.

## CFDI

Do NOT build a bespoke fiscal/tax engine.

If CFDI enters MVP:

Happy Animals domain
→ fiscal integration boundary
→ provider / PAC
→ external result/evidence.

Internal clinic ledger remains separate.

MVP inclusion:
OPEN.

## INVENTORY DIRECTION

If inventory enters MVP, minimum reliable direction:

InventoryItem
+
InventoryMovement
+
Branch
+
source/reason
+
actor
+
timestamp.

Stock truth should be derived or maintained transactionally from canonical movements.

Candidate movement categories:
- opening/import;
- adjustment;
- clinical consumption;
- direct sale;
- return/reversal;
- loss;
- expiration.

Rules:
- movement applied once;
- no impossible stock state;
- concurrency-safe transaction;
- manual adjustment requires actor + reason + evidence;
- reversals should prefer compensating movement over silent history rewrite.

DEFER:
- procurement;
- purchase orders;
- suppliers;
- warehouse management;
- transfers;
- reorder optimization;
- forecasting.

## COMMUNICATIONS / SIDE EFFECTS

Messaging must remain a side effect.

Preferred boundary:

DOMAIN ACTION
→ DOMAIN EVENT / DURABLE INTENT
→ MESSAGING ADAPTER / ORCHESTRATION
→ PROVIDER
→ DELIVERY RESULT
→ AUDIT / STATUS.

Messaging provider is authoritative only for delivery/provider-specific result.

It is NOT source of truth for:
- appointment state;
- medical record state;
- payment state;
- owner identity;
- reminder business rule.

If delivery fails, the underlying canonical operation remains valid unless product rules explicitly say otherwise.

n8n may orchestrate side effects when justified.

n8n is never source of truth for:
- clinical rules;
- money;
- permissions;
- inventory;
- entitlements;
- pricing.

## MIGRATION / IMPORT BASELINE

Migration is a future bounded capability.

Approved principles:

SOURCE DATA
→ STAGING
→ VALIDATION
→ DUPLICATE DETECTION
→ DRY RUN
→ CANONICAL IMPORT
→ RECONCILIATION
→ PROVENANCE.

Requirements when implemented:
- source identifiers preserved when available;
- source system provenance;
- source file/export;
- import batch;
- per-entity duplicate rules;
- idempotent re-run behavior;
- reconciliation counts;
- retry without replaying successful effects;
- no blind destructive rollback.

Detailed migration design:
DEFER until real source exports are observed.

## TRANSACTION BOUNDARY PRINCIPLE

Use the smallest transaction that guarantees the invariant.

Do not create one giant transaction simply because multiple effects happen around one visit.

### Appointment

Final collision check + state-changing insert/update must be protected atomically according to final business policy.

### Clinical Finalization

Finalization persists:
- state;
- author/finalizer;
- timestamp;
- audit/version metadata.

### Payment Application

Atomic domain effect should include:
- deduplicated verified evidence;
- Payment state;
- invoice allocation;
- invoice resulting balance/state;
- audit.

### Inventory

Atomic inventory effect should include:
- authorized movement;
- concurrency-safe stock effect;
- source reference;
- audit.

### Messaging

Outside core financial/clinical transaction.

## VERIFIED CURRENT IMPLEMENTATION BASELINE — 2026-09-14

Repository:
`Chris19723/HappyVet`

Canonical code baseline:
`main @ 0b826c0281380b4e2526c242407a60ec47597700`

Current deployment:
`https://happy-vet.replit.app`

Current application architecture:
- modular monolith;
- React/Vite/TypeScript frontend;
- Express/TypeScript backend;
- REST API;
- PostgreSQL 16;
- Drizzle ORM using `pg`;
- Replit Auth / OIDC / Passport;
- PostgreSQL-backed sessions;
- Replit autoscale runtime.

Verified current tables:
- appointments;
- expenses;
- inventory_items;
- invoice_items;
- invoices;
- medical_records;
- owners;
- patients;
- sessions;
- treatments;
- users.

### CURRENT-TO-TARGET ARCHITECTURE GAP

The current runtime does NOT yet implement the approved target tenancy model.

Missing:
- Organization;
- Branch;
- Membership;
- tenant-scoped foreign keys/ownership;
- tenant-aware query authorization.

Current tenant-owned records are effectively global across authenticated users.

Therefore the next structural evolution must add tenancy without introducing multi-location UI complexity.

### EXISTING-DATA MIGRATION PRINCIPLE

Existing data must be migrated into an initial canonical tenant:

`Organization`
→ `Default / Principal Branch`

The migration must:
- preserve existing IDs where practical;
- avoid orphaning references;
- backfill tenant/branch ownership deterministically;
- verify counts/reconciliation;
- be idempotent or safely restartable;
- include rollback/forward recovery planning;
- be tested on development/staging before production.

### VERSIONED MIGRATION REQUIREMENT

Verified current repository has no versioned `migrations/` history and relies on `drizzle-kit push`.

Before tenant/clinical structural changes:

`schema change`
→ `versioned migration artifact`
→ `test`
→ `review`
→ `controlled apply`
→ `post-migration verification`

`drizzle-kit push` alone is not the production change-management strategy for high-risk clinical/tenant data.

### SENSITIVE LOGGING REQUIREMENT

Current middleware may log truncated JSON response bodies.

Before expanding clinical payloads:
- stop logging response bodies containing PII/clinical data by default;
- use structured metadata instead;
- preserve request ID / route / status / duration / actor/tenant identifiers only when safe;
- maintain a separate purposeful audit trail rather than treating request logs as audit logs.

## SOURCE OF TRUTH

Critical logic lives in backend/domain + PostgreSQL.

Never make these source of truth for critical rules:
- frontend;
- n8n;
- AI prompts;
- CRM;
- payment provider;
- CFDI provider;
- messaging provider.

## REQUIRED ARCHITECTURE DECISIONS STILL OPEN

- final MVP domain/module set;
- exact schema;
- indexes;
- FK/constraint implementation;
- exact appointment collision policy;
- exact permission matrix;
- auth provider;
- ORM;
- payment provider;
- CFDI provider;
- storage provider;
- deployment topology;
- backups / RPO / RTO;
- exact import formats;
- final API contracts;
- exact concurrency mechanisms per workflow.

## IMPLEMENTATION GATE

Broad product-feature implementation is not authorized from this baseline alone.

Exception:
HQ may authorize safety/foundation remediation for the existing application before Gate 0F, including:
- tenancy;
- migration discipline;
- sensitive logging;
- security controls.

Before any implementation:
1. repository/current system baseline must be verified;
2. scope must have an explicit HQ TASK PACKET;
3. ONE FEATURE = ONE BRANCH = ONE ACTIVE WRITER;
4. acceptance criteria and tests must be defined;
5. product feature expansion still requires applicable Product/MVP gates.

Clinical Record expansion specifically requires foundation acceptance before implementation authorization.
