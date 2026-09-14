# HAPPY ANIMALS — SECURITY MODEL

STATUS: PHASE 0 SECURITY BASELINE APPROVED — IMPLEMENTATION DETAILS OPEN
OWNER: 01-ARCHITECTURE / 04-QA
LAST UPDATED: 2026-09-14
GATE 0D: PASS

## SECURITY PRINCIPLES

- browser is untrusted;
- authorization server-side;
- least privilege;
- deny by default when scope is not recognized;
- tenant isolation is structural;
- no secrets in frontend;
- no secrets in repo;
- no secrets in logs;
- no raw card data;
- minimize PII in logs;
- minimize clinical data in logs;
- external providers are not domain authority;
- destructive actions require explicit authorization + audit.

## IDENTITY MODEL

Approved conceptual separation:

User ≠ StaffMember ≠ Membership.

### User
Authentication identity.

User existence alone grants no tenant authorization.

### StaffMember
Person working for an Organization.

StaffMember record alone grants no access.

### Membership
Connects User to Organization and carries access state/role/scope.

Candidate states:
- invited;
- active;
- suspended;
- revoked.

Suspended/revoked Membership must not authorize access.

## AUTHENTICATION

Required baseline capabilities:

- secure authentication;
- secure session handling;
- reset/recovery;
- session revocation;
- brute-force protections;
- verification where appropriate;
- MFA considered for privileged roles when justified.

Auth provider:
DEFERRED.

## AUTHORIZATION

Authorization answers:

May this User perform this Action on this Resource inside this Organization/Branch in this current Resource state?

Baseline flow:

User
→ active Membership
→ Organization
→ Role / Scope
→ Resource ownership
→ Resource state
→ Action
→ ALLOW / DENY.

Initial model:
RBAC + tenant/resource/state checks.

Full ABAC / policy engine:
DEFERRED.

Authorization must remain server-side.

## TENANT ISOLATION

Tenant isolation must exist across:

- request context;
- domain/service layer;
- database queries;
- relational constraints where practical;
- file ownership;
- export/import;
- audit;
- tests.

Cross-tenant references are prohibited unless explicitly modeled as platform-level data.

UI filtering is not a security boundary.

## CLINICAL DATA SECURITY

Treat clinical data as high-sensitivity information.

Baseline rules:

- no silent overwrite of finalized clinical content;
- no silent deletion;
- clinical amendments/corrections auditable;
- author/timestamp/history preserved;
- clinical access role/tenant-aware;
- full clinical records should not appear in routine application logs;
- AI-generated clinical content remains draft/suggestion until valid human/domain action.

Final legal retention periods:
OPEN.

Do not invent jurisdiction-specific retention rules without legal/product review.

## FINANCIAL SECURITY

Keep separate:

1. clinical/service charge;
2. clinic invoice/ledger;
3. clinic payment;
4. external payment processor;
5. CFDI/fiscal integration;
6. Happy Animals SaaS billing.

Rules:

- never trust frontend success as payment proof;
- no raw card data;
- financial operations validated;
- authorized;
- idempotent;
- auditable;
- reconcilable.

Preferred external provider flow:

RECEIVE
→ VERIFY
→ DEDUPLICATE
→ PERSIST EVIDENCE
→ APPLY DOMAIN RULES
→ UPDATE PAYMENT / INVOICE
→ AUDIT.

Webhook controls when applicable:

- signature verification;
- replay protection;
- provider event IDs;
- timestamps;
- idempotency;
- deduplication;
- retry policy;
- observability.

Payment provider is not entitlement authority.

## CFDI / FISCAL SECURITY

CFDI is an external integration boundary.

Happy Animals:
- does not build a bespoke fiscal engine;
- stores only necessary provider/fiscal references/evidence;
- keeps internal clinic ledger separate;
- validates provider callbacks/events when applicable.

Provider selection:
DEFERRED.

## FILE SECURITY

Baseline:

- tenant/resource ownership;
- private-by-default access;
- authorization before upload/download;
- MIME/type validation;
- size limits;
- safe object storage;
- signed/short-lived access when appropriate;
- audit for high-risk access where justified;
- retention/deletion rules;
- malware/content scanning if threat model requires it later.

Storage provider:
DEFERRED.

## INPUT / OUTPUT VALIDATION

All external boundaries require explicit validation.

Candidate:
Zod.

Validate:
- request bodies;
- query params;
- path params;
- webhook payloads;
- file metadata;
- imported data;
- provider responses where required.

## RATE LIMITING / ABUSE

Evaluate separately by risk.

At minimum:

- login;
- password reset/recovery;
- public endpoints;
- expensive search/export;
- file upload;
- payment actions;
- webhook endpoints;
- messaging actions;
- AI actions if later introduced.

Do not rely on one global rate limit.

## SECRETS

Never expose secrets in:

- frontend;
- repository;
- client bundles;
- logs;
- analytics payloads;
- AI prompts.

Use managed environment/secrets mechanism according to selected runtime.

## AUDIT LOGS

Critical audit domains:

- authentication/security events;
- membership creation/state/role changes;
- clinical finalization;
- clinical amendment/correction;
- financial operations;
- refunds/reversals;
- financial overrides/discount changes;
- inventory adjustments;
- destructive actions;
- exports;
- imports;
- high-risk file access where justified;
- provider event processing.

Audit should answer:

WHAT
WHEN
WHO
TENANT
RESOURCE
ACTION
RESULT

without exposing unnecessary sensitive payloads.

## ENCRYPTION

Required:
- encryption in transit;
- encrypted database/storage capabilities from final infrastructure.

Application-level field encryption:
Only when threat/compliance model justifies it.

## BACKUPS / RECOVERY

Required before production:

- automated backups;
- restore capability;
- tested recovery;
- accidental tenant-wide deletion considered;
- operational recovery procedure.

Provider:
DEFERRED.

RPO/RTO:
DEFERRED.

## DATA RETENTION

Do not hardcode invented legal retention periods.

Retention must eventually be:
- jurisdiction-aware;
- domain-aware;
- product/legal reviewed;
- compatible with audit/clinical/financial obligations.

## EXPORT / DELETION

Architecture must support controlled export.

Deletion/anonymization must be policy-driven.

Clinical/financial records must not be blindly hard-deleted simply because an account/user requests deletion.

Final behavior depends on:
- domain;
- legal requirements;
- contract;
- data subject rights;
- retention obligations.

## AI SECURITY

AI is NOT required for MVP.

If introduced later, evaluate:

- prompt injection;
- indirect prompt injection;
- jailbreak;
- tool abuse;
- data exfiltration;
- privilege escalation;
- hallucinated authority;
- unsafe tool calls.

Runtime AI must NEVER be source of truth for:

- money;
- permissions;
- clinical records;
- inventory;
- subscriptions;
- destructive actions.

Critical AI-assisted flow when applicable:

AI REQUEST
→ POLICY CHECK
→ AUTHORIZATION
→ TOOL VALIDATION
→ BUSINESS RULE VALIDATION
→ EXECUTION
→ AUDIT.

## MESSAGING / AUTOMATION SECURITY

Messaging providers and n8n may handle side effects.

They cannot own:
- clinical truth;
- appointment truth;
- payment truth;
- inventory truth;
- permission truth;
- subscription entitlement truth.

Message payloads should minimize PII/clinical context.

Provider failures should be observable and retryable without corrupting the underlying canonical operation.

## VERIFIED CURRENT SECURITY GAPS — 2026-09-14

The following gaps are VERIFIED in the current HappyVet implementation and must not be confused with merely theoretical risks.

### SEC-GAP-01 — TENANT ISOLATION ABSENT
STATUS: HIGH / BLOCKER FOR SAAS-SAFE COMMERCIALIZATION

Current schema has no:
- Organization;
- Branch;
- Membership;
- `organization_id` / equivalent tenant boundary on tenant-owned data.

Authenticated users currently query global datasets.

Required remediation:
- introduce tenant identity/context;
- server-side tenant authorization;
- tenant ownership on existing data;
- relational cross-tenant protections where practical;
- wrong-tenant tests.

### SEC-GAP-02 — PERMISSIVE ROLE GUARD FAILURE MODE
STATUS: HIGH

Verified current `requireRole()` behavior may become permissive when `ADMIN_EMAILS` is empty.

Required remediation:
fail closed for authorization configuration.

Missing/invalid role configuration must not silently grant privileged access.

### SEC-GAP-03 — CLINICAL AUTHOR CLIENT-SUPPLIED
STATUS: HIGH

Current `veterinarianId` for medical record creation can arrive in client payload.

Required remediation:
clinical author/finalizer identity must be derived from authenticated server-side identity/membership and explicit authorized delegation rules, not trusted client claims.

### SEC-GAP-04 — CLINICAL LIFECYCLE / AUDIT ABSENT
STATUS: HIGH

Current clinical data lacks:
- finalized lock;
- amendment model;
- version history;
- purpose-built audit trail.

Storage contains update/hard-delete primitives for medical records.

Required remediation:
finalized clinical history must be immutable except through traceable amendment/correction semantics.

### SEC-GAP-05 — SENSITIVE RESPONSE BODY LOGGING
STATUS: HIGH

Current middleware may record truncated JSON response bodies, potentially including:
- names;
- identifiers;
- diagnoses;
- notes;
- other PII/clinical data.

Required remediation:
routine request logs must not contain clinical/PII response payloads.

Use structured metadata and a separate audit model.

### SEC-GAP-06 — UNVERSIONED DATABASE CHANGE PROCESS
STATUS: HIGH

Current repository has no reproducible versioned migration history; structural DB evolution relies on `drizzle-kit push`.

Required remediation before high-risk tenant/clinical migrations:
- versioned migration artifact;
- review;
- development/staging execution;
- reconciliation;
- recovery plan;
- post-migration verification.

### SEC-GAP-07 — FILE UPLOAD BOUNDARIES INCOMPLETE
STATUS: MEDIUM/HIGH

Verified current upload endpoint lacks complete server-side type/size policy and does not yet provide a clinical attachment model.

Do not expand medical-document storage until file security/ownership policy is implemented.

### SEC-GAP-08 — HISTORICAL DESTRUCTIVE OPERATIONS
STATUS: HIGH

Some current entities use hard delete, including operational/financial history.

This must be reviewed before production commercialization where audit/history matters.

## REQUIRED SECURITY TEST AREAS WHEN IMPLEMENTED

- authentication;
- authorization;
- tenant isolation;
- wrong tenant;
- wrong user;
- wrong role;
- membership revoked/suspended;
- privilege escalation;
- duplicate action;
- duplicate payment;
- duplicate webhook;
- replay;
- concurrent inventory changes;
- appointment race;
- clinical amendment/history;
- destructive actions;
- file authorization;
- webhook verification;
- export scope;
- prompt injection / unauthorized tool call if AI exists.

## OPEN IMPLEMENTATION DECISIONS

- auth provider;
- session mechanism;
- MFA policy;
- exact roles/permissions;
- deployment security;
- storage provider;
- payment provider;
- CFDI provider;
- backup provider;
- RPO/RTO;
- final retention rules;
- final file-scanning requirements;
- exact rate limits;
- exact logging/monitoring provider;
- jurisdiction-specific legal/privacy requirements.

## IMPLEMENTATION GATE

This security baseline does not authorize arbitrary product coding.

HQ may authorize security/foundation remediation before MVP closure because verified gaps exist in the already-running application.

Every remediation task must include:
- explicit scope;
- migration/data safety plan;
- server-side authorization requirements;
- security tests;
- rollback/recovery considerations;
- evidence returned to HQ.

Clinical feature expansion remains blocked until the required foundation security gaps are remediated and reviewed.
