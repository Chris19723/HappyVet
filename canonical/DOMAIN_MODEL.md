# HAPPY ANIMALS — DOMAIN MODEL

STATUS: PHASE 0 STRUCTURAL BASELINE APPROVED — MVP ENTITY SET OPEN
OWNER: 01-ARCHITECTURE
LAST UPDATED: 2026-09-14
GATE 0D: PASS

No entidad se considera una tabla final por aparecer en este documento.

Este archivo distingue:
- APPROVED STRUCTURAL CONCEPT;
- MVP CANDIDATE;
- DEFERRED.

## DOMAIN ROOT

### Organization
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Root commercial/customer account and primary tenant boundary.

Source of truth:
Happy Animals backend/domain + PostgreSQL.

Tenant ownership:
Root/self.

Relationships:
- Branches;
- Memberships;
- StaffMembers;
- Owners/Clients;
- Patients;
- financial records;
- SaaS Subscription/Entitlements;
- audit scope.

Candidate states:
- active;
- suspended;
- archived.

Critical constraints:
- cross-tenant references prohibited;
- access-affecting lifecycle changes audited.

Classification:
Operational/commercial metadata + possible PII.

---

### Branch
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Physical operating location.

Tenant ownership:
Organization.

Relationships:
- appointments;
- staff scope;
- inventory location;
- operational/financial context.

Candidate states:
- active;
- inactive;
- archived.

Critical constraints:
- belongs to exactly one Organization;
- no cross-organization relationships.

Rule:
Every Organization conceptually has at least one Branch.

Single-site:
Organization
→ Default Branch.

Multi-location UI/workflows:
NOT INITIAL MVP SCOPE.

---

### Clinic
STATUS: NOT A BASELINE PERSISTENCE ENTITY

Rule:

For current Phase 0:

Organization ≈ clinic business/customer.

Branch = physical clinic site.

Create a separate Clinic entity only if discovery proves distinct semantics.

## IDENTITY / STAFF

### User
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Global authentication identity.

Tenant ownership:
Not inherently tenant-owned.

Access:
None merely because User exists.

Tenant access comes through Membership.

Classification:
PII / security identity.

Critical invariant:
`user_id` alone never implies authorization.

---

### StaffMember
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Person working for an Organization whether or not login credentials exist.

Tenant ownership:
Organization.

May link to:
User.

Candidate states:
- active;
- inactive;
- archived.

Critical rule:
StaffMember itself does not grant authorization.

Classification:
PII / employment-operational.

Historical staff records may outlive current access.

---

### Membership
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Connect User to Organization and define access state/scope.

Tenant ownership:
Organization.

Relationships:
User + Organization + Role/Scope + optional StaffMember.

Candidate states:
- invited;
- active;
- suspended;
- revoked.

Critical constraints:
- suspended/revoked Membership grants no access;
- cannot be used outside its Organization;
- role/state changes audited.

Classification:
Security-critical.

## CLIENT / PATIENT

### Owner / Client
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Human client/responsible party for one or more animals.

Tenant ownership:
Organization.

Relationships:
- Patients;
- Appointments;
- Charges/Invoices;
- Communications;
- future portal identity.

Critical constraints:
- tenant-local;
- same human in unrelated clinics must not create accidental cross-tenant record sharing;
- identity merges/ownership changes audited.

Classification:
PII.

---

### Pet / Patient
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Veterinary patient.

Tenant ownership:
Organization.

Relationships:
- Owner(s);
- Appointments;
- MedicalRecord;
- Vaccinations;
- Encounters;
- Charges.

Candidate states:
- active;
- deceased;
- inactive/archive.

Critical constraints:
- referenced Owner must belong to same Organization;
- clinical records cannot cross tenant;
- responsibility/ownership changes auditable.

Classification:
Clinical + owner-linked PII.

## SCHEDULING

### Appointment
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Scheduling commitment for Patient/Owner/Staff/Branch.

Tenant ownership:
Organization.
Branch-scoped.

Relationships:
- Patient;
- Owner;
- Branch;
- StaffMember/Veterinarian;
- optional Encounter.

Candidate states:
- scheduled;
- confirmed;
- cancelled;
- no-show;
- completed.

Critical constraints:
- tenant consistency;
- valid time range;
- collision policy;
- duplicate booking protection;
- create/reschedule/cancel/override audited when consequential.

OPEN:
Exact overlap/override policy.

## CLINICAL

### MedicalRecord
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Longitudinal clinical record/chart for Patient.

Tenant ownership:
Organization.

Rule:
MedicalRecord is an aggregate/container, not one freely mutable blob.

Contains/references:
- Encounters;
- Vaccinations;
- treatment/procedure entries;
- documents/files as approved later.

Critical constraints:
- no cross-tenant links;
- no silent delete;
- no silent overwrite of finalized content;
- authorship/history retained.

Classification:
High-sensitivity clinical data.

---

### Encounter / Consultation
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Discrete clinical episode.

Tenant ownership:
Organization.
Branch context where relevant.

Relationships:
- Patient;
- optional Appointment;
- veterinarian;
- clinical notes;
- possible treatments/procedures;
- possible charges.

Baseline state model:

DRAFT
→ FINALIZED
→ AMENDMENT / CORRECTION.

Critical constraints:
- finalized content cannot be silently replaced;
- amendment/correction preserves original historical reference;
- author and timestamps retained;
- audit mandatory.

Classification:
Clinical.

---

### Vaccination
STATUS: MVP CANDIDATE

Purpose:
Structured vaccination/application record.

Why candidate:
Supports preventive history and reminders.

Potential relationships:
- Patient;
- Encounter;
- StaffMember/Veterinarian;
- optional InventoryItem.

MVP inclusion:
OPEN.

---

### ServiceDefinition
STATUS: MVP CANDIDATE

Purpose:
Catalog/business definition of a chargeable service.

Do not confuse with a performed clinical fact.

MVP inclusion:
OPEN.

---

### TreatmentEntry / PerformedProcedure
STATUS: MVP CANDIDATE

Purpose:
Clinical fact that a treatment/procedure was recommended/performed.

Critical rule:
A charge does not prove a clinical procedure occurred.
A clinical procedure does not prove payment.

Whether ServiceDefinition and TreatmentEntry / PerformedProcedure require independent persistence depends on approved MVP workflow.

## FINANCIAL — CLINIC OPERATIONS

### Invoice
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Clinic internal billing / ledger document.

It is NOT SAT/CFDI truth.

Tenant ownership:
Organization.
May carry Branch context.

Relationships:
- Owner;
- optionally Patient;
- InvoiceItems;
- Payments.

Candidate states:
- open;
- partially_paid;
- paid;
- void/cancelled.

Critical constraints:
- totals derived from authorized line items;
- controlled transitions;
- payment not inferred from frontend success;
- CFDI state separate;
- audit mandatory.

Classification:
Financial + PII.

---

### InvoiceItem / Charge Line
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Individual financial obligation.

May originate from:
- service;
- product;
- approved clinical source;
- authorized manual charge.

Critical constraints:
- source references traceable where relevant;
- not every charge must originate from clinical activity;
- price/discount/manual adjustment audited.

---

### Payment
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Clinic-side canonical record that value was received/applied.

Source of truth:
Happy Animals clinic financial domain after:
- authorized manual entry;
- or verified external evidence.

Candidate states:
- pending;
- confirmed;
- failed;
- refunded/reversed where supported.

Critical constraints:
- idempotency;
- duplicate protection;
- reconciliation;
- provider is not business source of truth.

Classification:
Financial.

## FISCAL / PAYMENT PROVIDERS

### ExternalPaymentEvidence
STATUS: CONCEPTUAL BOUNDARY / NOT FINAL ENTITY

Purpose:
Represent provider-specific transaction/event evidence when external payments are integrated.

Rule:
Provider state does not directly become clinic Payment state without verified domain processing.

---

### FiscalDocument / CFDIReference
STATUS: MVP CANDIDATE / PROVIDER BOUNDARY

Purpose:
Represent external fiscal result/reference if direct CFDI integration enters scope.

Rule:
Invoice ≠ CFDI.

Happy Animals does not build bespoke tax engine.

MVP inclusion:
OPEN.

## INVENTORY

### InventoryItem
STATUS: APPROVED STRUCTURAL CONCEPT IF INVENTORY ENTERS MVP

Purpose:
Product/medicine/supply tracked by clinic.

Tenant ownership:
Organization.

Stock scope:
Branch.

Critical constraints:
- no cross-tenant references;
- mutable UI stock number alone cannot be source of truth.

---

### InventoryMovement
STATUS: APPROVED STRUCTURAL CONCEPT IF INVENTORY ENTERS MVP

Purpose:
Traceable stock-affecting event.

Tenant ownership:
Organization + Branch.

Relationships:
- InventoryItem;
- actor;
- reason;
- source transaction/clinical event when applicable.

Baseline candidate types:
- opening/import;
- adjustment;
- clinical consumption;
- direct sale;
- return/reversal;
- loss;
- expiration.

Critical constraints:
- applied once;
- concurrency-safe;
- auditable;
- no silent history rewrite.

MVP inclusion of inventory:
OPEN.

DEFER:
- procurement;
- purchase orders;
- supplier automation;
- transfers;
- forecasting;
- reorder optimization.

## COMMUNICATIONS

### Reminder
STATUS: MVP CANDIDATE

Purpose:
Domain intent that something should occur or be communicated at/after a condition/time.

Potential examples:
- appointment reminder;
- vaccination reminder;
- follow-up.

Provider is not source of truth for reminder business rule.

---

### CommunicationAttempt / DeliveryRecord
STATUS: MVP CANDIDATE

Purpose:
Operational evidence that a message was attempted and its delivery/provider result.

Potential channels:
- WhatsApp;
- email;
- SMS.

Critical rule:
Provider message ID is not business/domain truth.

Payload must minimize PII/clinical context.

## PLATFORM BILLING

### Subscription
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Happy Animals SaaS commercial subscription for an Organization.

Tenant ownership:
Organization.

Critical rule:
Must never be confused with clinic-to-client billing.

Detailed plans/pricing:
OPEN.

---

### Entitlement
STATUS: APPROVED STRUCTURAL CONCEPT

Purpose:
Canonical set of product capabilities enabled for an Organization.

Source of truth:
Happy Animals domain.

May derive from:
- Subscription;
- contract;
- approved commercial rules.

Critical constraint:
Payment provider cannot directly become product authorization engine.

## FILES / DOCUMENTS

### File / Document
STATUS: MVP CANDIDATE

Potential uses:
- clinical attachments;
- generated documents;
- imported source files;
- receipts/exports where justified.

Requirements if approved:
- tenant ownership;
- private-by-default;
- authorization before access;
- audit where high-risk;
- retention policy.

Exact scope:
OPEN.

## APPROVED CRITICAL INVARIANTS

### HA-I01 — TENANT ISOLATION
No tenant-owned resource can be accessed by unrelated Organization.

### HA-I02 — CROSS-TENANT REFERENCE INTEGRITY
Tenant-owned relations cannot point to records from different Organization.

### HA-I03 — OWNER / PATIENT INTEGRITY
Owner/Patient relationships are same-tenant and responsibility changes auditable.

### HA-I04 — MEDICAL RECORD INTEGRITY
Finalized clinical content cannot be silently overwritten.

### HA-I05 — MEDICAL HISTORY PRESERVATION
Corrections/amendments preserve historical evidence, author, timestamp and reason.

### HA-I06 — AI IS NOT CLINICAL TRUTH
AI output is draft/suggestion until valid human/domain action.

### HA-I07 — APPOINTMENT COLLISION INTEGRITY
Concurrent bookings cannot violate final approved collision policy.

### HA-I08 — DUPLICATE ACTION SAFETY
Retries/replays/double-clicks cannot duplicate critical effects.

### HA-I09 — CHARGE ≠ PAYMENT
A charge creates an obligation, not settlement evidence.

### HA-I10 — PAYMENT INTEGRITY
Financial effect applied at most once and reconcilable.

### HA-I11 — PROCESSOR ≠ PAYMENT TRUTH
External processor is evidence/provider, not clinic business authority.

### HA-I12 — CFDI ≠ CLINIC LEDGER
Fiscal state remains separate from internal billing.

### HA-I13 — SAAS BILLING ≠ CLINIC BILLING
Happy Animals subscription billing is separate platform domain.

### HA-I14 — INVENTORY MOVEMENT INTEGRITY
Stock-changing effects traceable and applied once.

### HA-I15 — INVENTORY CONCURRENCY
Concurrent inventory changes cannot create impossible stock state.

### HA-I16 — SERVER-SIDE PERMISSIONS
Frontend visibility never grants authorization.

### HA-I17 — DESTRUCTIVE ACTION CONTROL
Critical destructive actions require explicit authorization + audit.

### HA-I18 — AUDITABILITY
Critical actions attributable to actor, tenant, time, resource, action and result.

### HA-I19 — EXTERNAL PROVIDERS ARE NOT DOMAIN AUTHORITY
Messaging, n8n, payment, CFDI, AI or other providers cannot silently own canonical domain truth.

## VERIFIED LEGACY / CURRENT IMPLEMENTATION MAPPING — 2026-09-14

The verified current application predates the approved domain baseline.

This section describes current implementation reality; it does NOT redefine the approved target domain.

### Current tables relevant to domain migration

Existing:
- `users`;
- `owners`;
- `patients`;
- `appointments`;
- `medical_records`;
- `treatments`;
- `invoices`;
- `invoice_items`;
- `inventory_items`;
- `expenses`;
- `sessions`.

Missing from current schema:
- `organizations`;
- `branches`;
- `memberships`;
- explicit tenant ownership on tenant-owned records;
- separate `encounters` lifecycle model;
- clinical amendments/audit entities.

### Current `medical_records`

Verified current fields:
- id;
- patient_id;
- veterinarian_id;
- appointment_id;
- date;
- diagnosis;
- treatment;
- prescription;
- notes;
- created_at;
- updated_at.

Current semantics:
`medical_records` behaves as an episodic clinical entry.

Target semantics:
`MedicalRecord` remains the longitudinal clinical aggregate/concept for a Patient, while `Encounter / Consultation` represents an episodic clinical event.

Do NOT assume that the target requires a dedicated `medical_records` table merely because the conceptual aggregate exists.

The exact persistence migration may:
- evolve/rename the existing episodic table into Encounter;
- migrate rows into a new Encounter table;
- or use another schema explicitly approved by HQ.

Required outcome:
- one longitudinal patient clinical history;
- multiple chronological Encounters;
- DRAFT → FINALIZED lifecycle;
- append-only Amendment/Correction behavior after finalization;
- authenticated/authorized author attribution;
- auditability;
- tenant ownership.

### Existing data tenancy backfill

Current data is effectively single/global tenant data.

Foundation migration must map all existing tenant-owned records to:
- one initial Organization;
- one initial Branch where branch context is required.

The backfill must maintain referential integrity across current entities.

### Current patient lifecycle

Current patient deletion uses `is_active=false` soft-deactivation.

Target direction:
retain soft/archive lifecycle and prevent destructive loss of patients with clinical/financial history.

### Current owner / appointment / financial deletes

Verified current implementation includes hard-delete behavior in some operational/financial entities.

This is implementation debt, not approved target-domain policy.

Any destructive behavior affecting historical clinical/financial integrity requires separate review before commercialization.

## OPEN PRODUCT / DOMAIN QUESTIONS

- final MVP entity set;
- final appointment collision policy;
- exact role/permission matrix;
- Vaccination MVP inclusion;
- Inventory MVP inclusion;
- clinic Billing/Payments MVP inclusion;
- CFDI MVP inclusion;
- cash/manual payment workflows;
- partial payments/refunds;
- exact clinical finalization policy;
- clinical retention/deletion rules;
- File/Document scope;
- Owner portal;
- exact migration source formats.

## IMPLEMENTATION NOTE

This domain model distinguishes approved target semantics from current legacy implementation reality.

It does NOT, by itself, authorize a specific table/schema design.

Foundation remediation may be implemented only through an explicit HQ TASK PACKET.

Clinical feature implementation requires:
- tenant/migration/logging foundation acceptance;
- explicit clinical data model refinement;
- explicit acceptance criteria/tests;
- HQ authorization.
