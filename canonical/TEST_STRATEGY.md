# HAPPY ANIMALS — TEST STRATEGY

STATUS: DRAFT
OWNER: 04-QA

## DEFINITION OF DONE
Según riesgo puede incluir:
- approved spec;
- typecheck;
- unit tests;
- integration tests;
- build;
- DB validation;
- migration validation;
- contract tests;
- security tests;
- tenant-isolation tests;
- concurrency tests;
- E2E;
- accessibility;
- responsive QA;
- visual QA;
- dev smoke;
- regression;
- UAT;
- release check;
- deployment;
- post-deploy verify.

## HIGH-RISK AREAS
- authentication;
- authorization;
- tenant isolation;
- medical records;
- appointments;
- payments;
- subscriptions;
- invoices;
- inventory;
- migrations;
- files;
- webhooks;
- destructive actions.

## FAILURE MODES TO TEST WHEN APPLICABLE
- duplicate action;
- duplicate payment;
- duplicate webhook;
- concurrent updates;
- wrong tenant;
- wrong branch;
- wrong user;
- wrong role;
- stale data;
- retry;
- replay;
- network failure;
- timeout;
- partial failure;
- rollback;
- invalid state transition;
- failed payment;
- subscription mismatch;
- AI hallucination;
- prompt injection;
- unauthorized tool call.

## RESULT STATES
PASS
FAIL
BLOCKED
NOT TESTED

Every result must include evidence.
