# HAPPY ANIMALS — MASTER CONTEXT

STATUS: PHASE 0 ACTIVE
LAST UPDATED: 2026-09-14

## 1. PRODUCT

Happy Animals es un proyecto de software / SaaS orientado a convertirse en un Veterinary Operating System / PIMS para clínicas veterinarias.

El producto debe diseñarse como un sistema comercial real, no como un simple ejercicio de software.

## 2. PRIMARY GOAL

Construir un producto:

- útil;
- vendible;
- rentable;
- seguro;
- mantenible;
- escalable;
- automatizable;
- preparado para IA cuando aporte valor;
- preparado para crecimiento;
- y construido con la menor complejidad necesaria.

## 3. CURRENT PHASE

PHASE 0 — DISCOVERY / PRODUCT & MARKET VALIDATION.

RELEASE STATUS:
NOT READY.

GENERAL PRODUCT IMPLEMENTATION STATUS:
HOLD.

FOUNDATION REMEDIATION:
MAY BE AUTHORIZED BY EXPLICIT HQ TASK PACKET.

Broad product-feature expansion remains blocked until sufficient Product/MVP evidence exists.

Safety/architecture remediation for the already-existing application may proceed before Gate 0F when explicitly authorized by HQ, including tenant isolation, versioned migrations and sensitive logging controls.

## 4. INITIAL COMMERCIAL MARKET

APPROVED:

MEXICO is the only initial commercial market.

Initial discovery operating cluster:
Guadalajara / ZMG.

Until HQ explicitly reopens the geography decision:

- paid subscriptions: Mexico only;
- commercial offers: Mexican veterinary clinics only;
- pricing experiments/commercial pricing: MXN;
- outbound: Mexico;
- partnerships: Mexico;
- SEO conversion strategy: Mexico;
- paid acquisition: Mexico;
- onboarding/support/localization: optimize first for Mexico.

### USA / CANADA

Authorized as:
- market intelligence;
- product benchmark;
- pricing benchmark;
- technology/integration benchmark;
- future expansion candidate.

Not authorized for:
- commercial launch;
- subscriptions;
- outbound;
- paid acquisition;
- contracts;
- revenue forecasts.

### Architecture principle

Mexico-first must not become Mexico-only architecture.

Preserve reasonable future internationalization through:
- currency boundaries;
- timezone handling;
- localization boundaries;
- payment-provider boundaries;
- invoicing/tax-provider boundaries;
- messaging-provider boundaries.

Do not build unused USA/Canada compliance/localization now.

## 5. PRODUCT THESIS

STATUS:
TO VALIDATE.

Current hypothesis:

Happy Animals can become a modern Veterinary Operating System / PIMS for veterinary clinics that reduces operational friction, centralizes clinical and administrative information, and improves the client experience.

Current wedge hypothesis:

END-TO-END CLINIC WORKFLOW
rather than a disconnected module checklist.

Candidate flow:

OWNER / CLIENT
→ PET / PATIENT
→ APPOINTMENT
→ CONSULTATION / MEDICAL RECORD
→ TREATMENT / SERVICE
→ CHARGE
→ PAYMENT
→ INVENTORY EFFECT
→ FOLLOW-UP / REMINDER.

This is NOT yet an approved MVP.

## 6. PRIMARY DISCOVERY ICP

STATUS:
APPROVED DISCOVERY HYPOTHESIS — NOT FINAL ICP.

Target for current discovery:

- Mexico;
- companion-animal veterinary clinic;
- single-site;
- established clinic;
- approximately 2–5 veterinarians.

Buyer hypothesis:
clinic owner / owner-veterinarian, potentially administrator in more mature clinics.

## 7. COMMERCIAL GOAL

Find and validate a sustainable monetization model.

Approved direction:

SUBSCRIPTION-FIRST SAAS
+ OPTIONAL IMPLEMENTATION / MIGRATION
+ FUTURE VARIABLE-COST ADD-ONS WHEN JUSTIFIED.

One-time perpetual license:
NOT preferred as initial base model.

Final pricing:
NOT APPROVED.

WTP test points only:
- MXN $799;
- MXN $1,299;
- MXN $1,999.

## 8. CURRENT MARKET POSITION

Competitor/market baseline:
ACCEPTED.

Category:
mature and competitive.

Current conclusion:

"Agenda + expediente + inventario en la nube" is not sufficient differentiation.

"PIMS con IA" is not sufficient differentiation.

Potential differentiator hypotheses:
- simple without being weak;
- coherent clinical → charge → inventory → follow-up workflow;
- migration/onboarding quality;
- Mexico localization without Mexico-only architecture;
- low-friction adoption;
- operational control.

All still need first-party evidence.

## 9. DOMAIN / ARCHITECTURE BASELINE

GATE 0D:
PASS.

Approved:

### Tenancy
Platform
→ Organization
→ Branch.

Organization:
root tenant / commercial customer.

Branch:
physical location.
Exists conceptually from baseline even for single-site customers.

No separate Clinic persistence entity unless discovery proves distinct semantics.

### Identity
User ≠ StaffMember ≠ Membership.

### Clinical
MedicalRecord = longitudinal aggregate.

Encounter / Consultation = episodic clinical unit.

Clinical history baseline:
DRAFT
→ FINALIZED
→ AMENDMENT / CORRECTION.

No silent overwrite/deletion of finalized clinical content.

### Financial
Keep separate:
1. clinical/service charge;
2. clinic invoice/ledger;
3. clinic payment;
4. external payment processor;
5. CFDI/fiscal provider;
6. Happy Animals SaaS billing.

### Inventory
If included:
InventoryItem + InventoryMovement + Branch + source/reason + actor + timestamp.

Inventory MVP inclusion:
OPEN.

### Migration
Future bounded capability with:
staging, validation, duplicate detection, dry-run, idempotency, reconciliation and provenance.

Detailed import design:
DEFER until source exports are known.

## 10. TECHNICAL BASELINE

Approved conceptual direction:

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

Likely:
- Zod.

Deferred:
- final ORM;
- auth provider;
- payment provider;
- CFDI provider;
- storage provider;
- deployment topology;
- exact n8n usage.

Not justified now:
- microservices;
- Kafka;
- CQRS;
- event sourcing;
- vector DB;
- MCP;
- A2A;
- autonomous agents.

## 11. SECURITY BASELINE

Approved principles:

- browser untrusted;
- authorization server-side;
- RBAC initially + tenant/resource/state checks;
- least privilege;
- tenant isolation;
- no cross-tenant references;
- no secrets in frontend/repo/logs;
- no raw card data;
- clinical data treated as high sensitivity;
- finalized clinical history must remain auditable;
- critical financial effects idempotent/reconcilable;
- private-by-default files;
- audit critical actions;
- backups/restore required before production;
- external providers are not domain authority.

## 12. AI POSITION

AI is NOT required for the initial MVP.

If runtime AI is later incorporated, it must never become source of truth for:
- money;
- permissions;
- clinical records;
- inventory;
- subscriptions;
- destructive actions.

## 13. CANDIDATE PRODUCT DOMAINS

Structural concepts approved:
- Organization;
- Branch;
- User;
- StaffMember;
- Membership;
- Owner / Client;
- Pet / Patient;
- Appointment;
- MedicalRecord;
- Encounter / Consultation;
- Invoice;
- InvoiceItem / Charge Line;
- Payment;
- Subscription;
- Entitlement.

MVP candidates / unresolved:
- Vaccination;
- ServiceDefinition;
- TreatmentEntry / PerformedProcedure;
- Inventory;
- Reminder;
- CommunicationAttempt / DeliveryRecord;
- File / Document;
- CFDI integration;
- Owner portal.

## 14. BUILD-TIME TOOLCHAIN

ChatGPT:
Master Project Manager / Orchestrator.

Codex:
backend, DB, security, concurrency, integrations, tests, refactors, code review.

Claude Code:
frontend, UX, design systems, accessibility, interaction, visual polish.

Replit:
runtime, preview, staging, debugging, deployment when authorized.

GitHub:
VERIFIED durable source of truth for code and canonical documentation.
Repository: `Chris19723/HappyVet`.
Canonical branch: `main`.

n8n:
automation/orchestration/side effects when justified.

## 15. DESIGN SKILLS

Evaluate selectively:
- DESIGN.md;
- Awesome DESIGN.md;
- getdesign.md;
- Taste Skill;
- Impeccable;
- Emil Kowalski design/motion skill.

Do not use all automatically.

DESIGN.md becomes visual source of truth once approved.

## 16. GOVERNANCE

ONE FEATURE = ONE BRANCH = ONE ACTIVE WRITER.

Chats especializados pueden:
- research;
- analyze;
- design;
- recommend;
- detect risk.

No pueden cambiar unilateralmente:
- scope;
- pricing;
- architecture;
- roadmap;
- release state;
- critical business rules.

Durable changes return to 00-HQ.

## 17. VERIFIED CURRENT IMPLEMENTATION

Repository:
`Chris19723/HappyVet`

Canonical code branch:
`main`

Canonical application-code baseline:
`0b826c0281380b4e2526c242407a60ec47597700`

Current deployment:
`https://happy-vet.replit.app`

Current verified stack:
- React 18 + TypeScript + Vite;
- Wouter;
- TanStack Query;
- Tailwind + Radix/shadcn-style;
- React Hook Form + Zod;
- Node.js + Express;
- PostgreSQL 16;
- Drizzle ORM using `pg`;
- Replit Auth / OIDC / Passport;
- REST API;
- Replit autoscale.

Current verified tables:
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

Important verified gaps:
- no Organization/Branch/Membership tenant model in current schema;
- authenticated data access is global rather than tenant-isolated;
- no versioned migration history in repository; current DB change path uses `drizzle-kit push`;
- current `medical_records` acts as an episodic record rather than longitudinal MedicalRecord + Encounter lifecycle;
- no clinical DRAFT/FINALIZED/AMENDMENT lifecycle;
- clinical veterinarian attribution can be supplied by client payload;
- routine logging may include fragments of PII/clinical response payloads.

Current foundation priority:
tenant isolation + reproducible migrations + sensitive logging remediation before expanding the Clinical Record.

## 18. CURRENT GATES

### Gate 0A — Product Thesis
OPEN.

### Gate 0B — Market / Competitor Evidence
OPEN — competitor baseline accepted.

### Gate 0C — Monetization Hypothesis
OPEN — subscription-first direction approved, pricing open.

### Gate 0D — Domain / Architecture Baseline
PASS.

### Gate 0E — UX / Design Direction
OPEN / STANDBY.

### Gate 0F — MVP Scope
OPEN.

## 19. ACTIVE TASK

HA-GROWTH-001A — MEXICO ICP / WTP FIRST-PARTY DISCOVERY.

Owner:
06 — MARKETING / SALES / GROWTH / REVENUE.

Target:
- qualified clinic universe beginning Guadalajara/ZMG;
- 12–15 owner / decision-maker interviews;
- workflow observation where practical;
- WTP discovery;
- switching/migration/localization evidence.

No paid acquisition.
No final pricing.
No implementation authorization.

## 20. OPEN ITEMS

- first-party ICP evidence;
- primary workflow pain;
- real current software use;
- real current spend;
- WTP;
- switching trigger;
- migration source formats;
- inventory MVP decision;
- CFDI MVP decision;
- WhatsApp role;
- owner portal need;
- final Product Thesis;
- final MVP;
- exact role matrix;
- exact appointment rules;
- tenant foundation implementation;
- versioned migration strategy implementation;
- sensitive logging remediation;
- migration of legacy/global data into initial Organization/Branch;
- providers;
- final long-term auth/payment/storage topology.

## 21. NEXT SEQUENCE

1. Complete HA-DOCS-001: place canonical docs in verified GitHub repository.
2. Continue HA-GROWTH-001A first-party discovery in parallel.
3. Execute HA-FOUND-001: Organization / Branch / Membership / tenant isolation foundation.
4. Execute HA-FOUND-002: versioned migrations + sensitive logging baseline.
5. Security/QA review the foundation.
6. Reconcile Market + Product + Architecture evidence.
7. Progress/close Gates 0A, 0B, 0C and 0F as evidence allows.
8. Authorize HA-CLIN-001 only after foundation acceptance and explicit HQ task packet.
9. Authorize HA-CLIN-002 after backend contracts are stable.
