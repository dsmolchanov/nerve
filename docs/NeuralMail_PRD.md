# NeuralMail PRD (v1)

## Summary
NeuralMail is an open-source “SQLite of agent email” with a cloud layer for deliverability, security, and scale. v1 targets inbound support inbox automation with workflow-grade MCP tools (triage, extract, draft-under-policy) and deterministic observability.

## Problem
Teams building agent workflows on email waste time on glue code (IMAP/SMTP, threading, schema extraction, policy drafts) and suffer reliability, deliverability, and security risks. Existing tools are low-level and not MCP-native.

## Goals
- Enable a developer to run a full local email agent stack in under 15 minutes.
- Provide 5–8 MCP tools that eliminate common email automation glue code.
- Deliver inbound support automation that is safe, observable, and accurate enough for pilot use.
- Establish a cloud control plane that improves deliverability and security while keeping OSS credible.

## Non-Goals
- Outbound SDR automation.
- Full-featured CRM or ticketing system.
- Multi-region HA in OSS.
- Enterprise compliance certifications in v1.

## Target Users
- AI engineers building email agents.
- Support operations teams running high-volume inbound email.
- Security-conscious teams needing auditable tool actions.

## Primary Use Case
Support inbox autopilot that triages, extracts structured data, drafts compliant replies, and routes escalations.

## Key Differentiators
- MCP-first workflow-grade tools rather than IMAP wrappers.
- Security-first MCP with scoped tokens and audit trails.
- Deterministic observability and replay for agent actions.
- Local-first OSS with a clear cloud value layer.

## User Stories
- As a developer, I can run `docker compose up` and receive/send email via MCP in minutes.
- As a support ops lead, I can auto-triage inbound emails into a taxonomy with confidence scores.
- As an agent developer, I can extract structured fields into a schema with validation errors.
- As a policy owner, I can draft replies that respect forbidden promises and redactions.
- As a security reviewer, I can audit who or what sent each reply and why.

## Product Requirements
- OSS stack runs locally with Stalwart, JMAP, MCP server, and vector memory.
- Core MCP tools include list/get/search, triage, extract, draft-with-policy, and send.
- Semantic search is backed by embeddings and a vector store.
- Thread and message normalization produce stable IDs.
- Tool invocations are traceable with inputs, outputs, latency, and actor.
- Cloud relay for localhost tunneling is available as an optional DX booster.
- Cloud deliverability control plane exists in preview.

## Functional Requirements
- JMAP event ingestion with replayable offsets.
- Threading logic with deterministic participants hash.
- Embedding pipeline with configurable chunking and metadata.
- Policy engine that constrains outbound drafts.
- Webhook or polling fallback for event delivery.
- MCP auth with scoped tokens in cloud.

## Non-Functional Requirements
- Deterministic tool outputs given fixed inputs and model version.
- Audit logs for all tool invocations.
- Security defaults that include allowlists for outbound domains and injection hygiene.
- Search returns in under 2 seconds for 10k messages in local mode.
- Ingestion and send pipelines are observable and replayable.

## MVP Scope
- Local stack and developer CLI.
- 5–8 MCP tools with JSON schemas.
- Support autopilot pack template.
- Basic observability and audit logs.
- Limited cloud preview for deliverability and auth.

## Milestones And Exit Criteria
- Milestone A: Localhost loop works.
- Exit: Send and receive email locally, list/get/search via MCP, basic send works.
- Milestone B: Semantic primitives are useful.
- Exit: Triage and extraction tested on real support inbox samples.
- Milestone C: Cloud is trustworthy.
- Exit: OAuth-scoped MCP auth, audit logs, basic deliverability gating.
- Milestone D: Vertical pack shipped.
- Exit: 2–3 paying teams use support autopilot in production.

## Success Metrics
- Time-to-first-email under 15 minutes in OSS.
- Triage accuracy acceptable for pilot teams.
- Extraction field completion above 80 percent on target schemas.
- Draft acceptance rate above 60 percent with human review.
- Cloud onboarding under 1 hour for domain verification.

## Risks And Mitigations
- Deliverability risk from outbound misuse.
- Mitigation: inbound-first, outbound off by default, trust-based gating.
- Security risk from MCP tool abuse.
- Mitigation: scoped tokens, audit logs, allowlists, injection hygiene.
- OSS scope creep.
- Mitigation: strict tooling focus and avoid CRM or ticketing features.
- Model variability in draft or triage quality.
- Mitigation: deterministic configs, replays, and evaluation set.

## Dependencies
- Stalwart Mail Server for SMTP, IMAP, and JMAP.
- Vector store such as Qdrant or LanceDB.
- JMAP push or polling support.
- MCP server framework and auth.

## Open Questions
- Default vector store in OSS: Qdrant.
- Bridge implementation: Go.
- Draft policy schema for draft-with-policy (see below).
- Recommended authentication flow for local versus cloud MCP (see below).

## Draft Policy Schema (v1)
Goal: Constrain outbound drafts with enforceable rules and explicit risk flags.

Suggested schema (JSON):
```json
{
  "id": "support-default-v1",
  "name": "Support Reply Policy v1",
  "version": 1,
  "allowed_tones": ["neutral", "friendly", "professional"],
  "forbidden_phrases": ["guarantee", "100% refund", "we promise"],
  "required_disclosures": ["This email was generated with AI assistance."],
  "redactions": {
    "patterns": ["\\\\b\\d{3}-\\d{2}-\\d{4}\\\\b"],
    "replacement": "[REDACTED]"
  },
  "outbound_domain_allowlist": ["example.com", "customer.com"],
  "max_reply_length_chars": 4000,
  "attachment_rules": {
    "allow": false,
    "max_size_bytes": 0,
    "mime_allowlist": []
  },
  "approval": {
    "required_when": ["low_confidence", "contains_refund", "mentions_legal"],
    "confidence_threshold": 0.7
  }
}
```

Output contract for `draft_reply_with_policy`:
- `draft`: String body after redaction and policy constraints.
- `risk_flags`: Array of policy violations or review triggers.
- `cited_message_ids`: Source messages used for the draft.
- `needs_human_approval`: Boolean derived from policy rules.

## Recommended Auth Flow
Local OSS:
- Static MCP API key generated by CLI, stored in local config, bound to local host.
- Optional mTLS for localhost tunnel relay.

Cloud:
- OAuth 2.1 Authorization Code with PKCE for user-facing clients.
- OAuth 2.1 Client Credentials for server-to-server MCP tool calls.
- Access tokens scoped by: org, inbox, tool, and rate tier.
- All tool calls logged in `audit_log` with token_id and actor.

## Deliverables
- MCP contract spec with JSON schemas.
- Event model spec for JMAP to thread normalization.
- Security model doc with token scopes, audit logging, and allowlists.
- Support autopilot pack with taxonomy, schemas, and policies.
