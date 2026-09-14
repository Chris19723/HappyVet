# HAPPY ANIMALS — DECISION LOG

LAST UPDATED: 2026-09-14

Las decisiones aprobadas no deben reabrirse casualmente.

## TEMPLATE

ID:
DATE:
STATUS: PROPOSED / APPROVED / SUPERSEDED / REJECTED
DOMAIN:
DECISION:
WHY:
EVIDENCE:
ALTERNATIVES:
TRADEOFFS:
IMPACT:
OWNER:
REOPEN ONLY IF:

---

## D-000 — PROJECT GOVERNANCE

DATE: 2026-09-09
STATUS: APPROVED
DOMAIN: Governance

DECISION:

ChatGPT / 00-HQ funciona como Master Project Manager / Orchestrator.

GitHub será source of truth durable del código y documentación canónica cuando exista repositorio.

Los chats especializados analizan y proponen dentro de scopes delimitados.

ONE FEATURE = ONE BRANCH = ONE ACTIVE WRITER.

WHY:

Evitar contradicciones, scope creep, decisiones duplicadas, multi-agent collisions y pérdida de contexto.

OWNER:
00-HQ.

REOPEN ONLY IF:

Existe nueva evidencia operacional que demuestre que este modelo de coordinación ya no funciona.

---

## D-001 — INITIAL COMMERCIAL GEOGRAPHY

DATE: 2026-09-09
STATUS: APPROVED
DOMAIN: Product / Commercial / Market

DECISION:

México es el único mercado comercial inicial de Happy Animals.

Hasta que HQ reabra explícitamente esta decisión:

- las suscripciones pagadas se venderán únicamente en México;
- las ofertas comerciales se dirigirán únicamente a clínicas veterinarias mexicanas;
- pricing experiments y pricing comercial se evaluarán en MXN;
- outbound, partnerships, SEO orientado a conversión y paid acquisition se dirigirán a México;
- payment, invoicing, onboarding, support y localization decisions optimizarán primero para México.

USA y Canadá permanecen autorizados únicamente como:

- market intelligence sources;
- product benchmarks;
- pricing benchmarks;
- technology/integration benchmarks;
- future expansion candidates.

USA y Canadá NO están autorizados actualmente para:

- commercial launch;
- paid subscriptions;
- outbound sales;
- paid acquisition;
- customer contracts;
- revenue forecasts.

WHY:

Happy Animals debe validar product-market fit, monetización y operaciones primero en México antes de asumir la complejidad legal, fiscal, contractual, de pagos, soporte y operación de otros países.

ARCHITECTURE PRINCIPLE:

Mexico-first no debe convertirse en Mexico-only architecture.

La arquitectura debe preservar internacionalización futura razonable mediante:

- currency boundaries;
- timezone handling;
- localization boundaries;
- payment-provider boundaries;
- invoicing/tax-provider boundaries;
- messaging-provider boundaries.

No se construirán capacidades de cumplimiento o localización de USA/Canadá sin necesidad actual.

IMPACT:

- Discovery, WTP y pilots: México.
- Initial cluster: Guadalajara / ZMG.
- Commercial currency: MXN.
- International expansion: LATER / HQ-gated.

OWNER:
00-HQ + 06-MARKETING.

REOPEN ONLY IF:

- México produce suficiente evidencia para expansión;
- requisitos legales/payment/compliance del nuevo país fueron revisados;
- economics justifican expansión;
- HQ autoriza explícitamente la nueva geografía.

---

## D-002 — PHASE 0 DOMAIN / ARCHITECTURE BASELINE

DATE: 2026-09-09
STATUS: APPROVED
DOMAIN: Product Architecture / Domain / Security

DECISION:

Gate 0D — DOMAIN / ARCHITECTURE BASELINE = PASS.

Se aprueban las siguientes verdades estructurales:

1. `Organization` es el tenant root y la cuenta comercial cliente de Happy Animals.
2. No se crea una entidad persistente separada `Clinic` en el baseline. `Organization` representa el negocio/cliente y `Branch` la ubicación física.
3. Toda `Organization` tendrá conceptualmente al menos un `Branch`; multi-location UI/workflows no son scope inicial.
4. `User ≠ StaffMember ≠ Membership`.
5. `MedicalRecord` es el expediente longitudinal y `Encounter / Consultation` la unidad episódica principal.
6. Baseline clínico: `DRAFT → FINALIZED → AMENDMENT / CORRECTION`; no hay overwrite/delete silencioso de contenido finalizado.
7. Permanecen separados: service charge, clinic invoice/ledger, clinic payment, external processor, CFDI/fiscal provider y Happy Animals SaaS billing.
8. Si inventory entra al MVP, el baseline es `InventoryItem + InventoryMovement + Branch + source/reason + actor + timestamp`.
9. Baseline técnico: `MODULAR MONOLITH + TYPESCRIPT + POSTGRESQL + REST + EXPLICIT VALIDATION + STRUCTURED OBSERVABILITY`.
10. Migration/import se reconoce como capability futura con staging, validation, duplicate detection, dry-run, idempotency, reconciliation y provenance; implementación diferida.

KEEP:
- TypeScript;
- PostgreSQL;
- REST;
- structured logs;
- error tracking;
- health checks;
- audit logs;
- simple domain events when justified.

LIKELY / NOT FROZEN:
- Zod.

DEFER:
- ORM final;
- auth provider;
- payment provider;
- storage provider;
- CFDI provider;
- deployment topology;
- exact n8n usage.

REJECT FOR CURRENT BASELINE:
- microservices;
- Kafka;
- CQRS;
- event sourcing;
- vector DB / RAG infrastructure;
- MCP;
- A2A;
- autonomous agents.

WHY:

Estas decisiones reducen ambigüedad estructural sin congelar prematuramente schema, providers o implementation details.

IMPACT:

- Gate 0D pasa.
- Implementation continúa NO AUTHORIZED.
- El siguiente cierre relevante es Product/MVP scope.

OWNER:
00-HQ + 01-ARCHITECTURE.

REOPEN ONLY IF:

- nueva evidencia del dominio;
- contradicción con workflow validado;
- nueva obligación de seguridad/legal;
- evidencia del repositorio existente que haga inviable una decisión;
- cambio material de producto.

---

## D-003 — MONETIZATION DIRECTION

DATE: 2026-09-09
STATUS: APPROVED
DOMAIN: Commercial / Revenue

DECISION:

La dirección comercial base será:

SUBSCRIPTION-FIRST SAAS
+ OPTIONAL IMPLEMENTATION / MIGRATION
+ FUTURE VARIABLE-COST ADD-ONS WHEN JUSTIFIED.

Una licencia perpetua de pago único no será el modelo principal inicial.

Final pricing NO está aprobado.

Los puntos:
- MXN $799;
- MXN $1,299;
- MXN $1,999;

son únicamente WTP experiment anchors y no son precios canónicos.

WHY:

El mercado PIMS actual favorece recurring SaaS y migration/onboarding puede representar trabajo/costo real.

IMPACT:

- monetization direction definida;
- Gate 0C continúa OPEN hasta WTP first-party;
- Subscription/Entitlement permanecen conceptos arquitectónicos válidos;
- pricing final y packaging siguen abiertos.

OWNER:
00-HQ + 06-MARKETING.

REOPEN ONLY IF:

- WTP first-party contradice el modelo;
- cost-to-serve vuelve inviable la dirección;
- comportamiento de compra muestra preferencia materialmente distinta;
- HQ aprueba un modelo alternativo.

---

## D-004 — AI MVP POSITION

DATE: 2026-09-09
STATUS: APPROVED
DOMAIN: Product / AI / Security

DECISION:

AI no es requisito del MVP inicial de Happy Animals.

Si se incorpora runtime AI posteriormente, nunca será source of truth para:

- money;
- permissions;
- clinical records;
- inventory;
- subscriptions;
- destructive actions.

AI output en dominios críticos debe tratarse como suggestion/draft hasta validación humana/domain action correspondiente.

WHY:

La competencia ya ofrece AI capabilities y no existe evidencia de que AI sea el wedge inicial correcto.

IMPACT:

- no AI infrastructure en MVP baseline;
- no vector DB / RAG / autonomous agents sin use case validado.

OWNER:
00-HQ + 05-AUTOMATION / AI + 01-ARCHITECTURE.

REOPEN ONLY IF:

Existe un caso de uso validado con valor real que no comprometa la autoridad del dominio.

---

## D-005 — VERIFIED APPLICATION / REPOSITORY BASELINE

DATE: 2026-09-14
STATUS: APPROVED
DOMAIN: Repository / Runtime / Delivery

DECISION:

The existing Happy Animals application is verified as an active implementation and is now part of the project reality that future work must evolve rather than silently replace.

Canonical code repository:

`Chris19723/HappyVet`

Canonical code branch:

`main`

Canonical application-code baseline:

`0b826c0281380b4e2526c242407a60ec47597700`

The currently published Replit revision `2d29e002bcd3851c1a951d452b23add2dbe74810` has the same Git tree/content as the canonical `origin/main` baseline. Replit Publishing-only empty commits do not change application code and are not required to be pushed to GitHub.

Verified current runtime stack:

- React 18 + TypeScript + Vite;
- Wouter;
- TanStack Query;
- Tailwind + Radix/shadcn-style components;
- React Hook Form + Zod;
- Node.js + Express;
- PostgreSQL 16;
- Drizzle ORM using `pg`;
- Replit Auth / OIDC / Passport;
- REST API;
- Replit autoscale deployment.

Verified current deployment:

`https://happy-vet.replit.app`

WHY:

Repository/runtime uncertainty previously blocked safe implementation planning. HA-RUNTIME-AUDIT-001, HA-REPO-001 and HA-REPO-002 established a clean and reproducible baseline.

IMPACT:

- B-002 — REPOSITORY / CURRENT IMPLEMENTATION UNKNOWN is CLOSED.
- New work must start from the verified `main` baseline unless HQ explicitly approves another base.
- Existing application behavior and data require migration/evolution plans; greenfield replacement is not assumed.
- GitHub becomes durable source of truth for code and canonical documentation once canonical docs are merged.

OWNER:
00-HQ + 03-ENGINEERING + Replit runtime verification.

REOPEN ONLY IF:

- repository ownership changes;
- default codebase changes;
- HQ authorizes a replacement/migration to another repository;
- verified evidence shows the baseline was incorrect.

---

## D-006 — FOUNDATION REMEDIATION BEFORE PRODUCT FEATURE EXPANSION

DATE: 2026-09-14
STATUS: APPROVED
DOMAIN: Architecture / Security / Delivery

DECISION:

The verified application currently lacks structural controls required by the approved Happy Animals architecture.

Before implementing a full Clinical Record / Encounter feature or other major product expansion, HQ requires foundation remediation for:

1. `Organization` tenant root;
2. baseline `Branch`;
3. `Membership`-based tenant access;
4. server-side tenant isolation across existing tenant-owned data;
5. safe migration of existing single-clinic/global data into the initial Organization/Branch;
6. versioned/reproducible database migrations;
7. sensitive-response logging remediation so PII/clinical payloads are not emitted to routine logs;
8. security tests for wrong-tenant / wrong-role access.

This foundation work MAY be authorized before Gate 0F closes because it is a safety/architecture prerequisite for the already-existing application, not approval of new commercial product scope.

Major product-feature expansion remains HQ-gated.

The Clinical Record implementation remains blocked until the applicable foundation gates/task acceptance criteria pass.

WHY:

The current application has no `organization_id` / tenant boundary, authenticated users operate on a global dataset, database changes rely on `drizzle-kit push` without versioned migrations, and routine response logging may expose fragments of clinical/PII data.

Building richer clinical data on top of those gaps would increase migration cost and security risk.

ALTERNATIVES:

- Continue as single-clinic software and retrofit tenancy later.
- Build Clinical Record first and migrate later.
- Rewrite the application.

REJECTED DIRECTION:

Do not knowingly deepen the single-tenant/global-data model for a product already approved as subscription SaaS with Organization/Branch tenancy.

TRADEOFFS:

- foundation work delays visible clinical UI;
- reduces later cross-tenant migration complexity;
- improves safety and SaaS readiness;
- preserves the existing application instead of rewriting it.

IMPACT:

Priority technical sequence becomes:

`canonical docs → tenant/migration/logging foundation → clinical backend/data → clinical UX → QA/UAT`

ACTIVE WRITER POLICY:

- backend/data/security foundation: Codex preferred;
- frontend writer only after backend contracts are stable;
- Replit verifies runtime/staging;
- no simultaneous writers on the same feature surface.

OWNER:
00-HQ + 01-ARCHITECTURE + 03-ENGINEERING + 04-QA.

REOPEN ONLY IF:

- HQ changes the commercial model away from multi-tenant SaaS;
- verified technical evidence shows an alternative provides equivalent isolation/safety with lower risk;
- migration constraints require a materially different sequence.
