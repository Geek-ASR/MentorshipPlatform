# Security Policy

## Reporting a vulnerability

Please **do not open public issues** for security problems.

Report privately through GitHub: **Security → Report a vulnerability** on this repository
(private vulnerability reporting). Include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- affected commit, route or component.

We aim to acknowledge reports within **3 business days** and to share a remediation plan within
**10 business days**. Please give us a reasonable opportunity to fix the issue before any disclosure.

## Scope

This project is **pre-release**. There is no production deployment and no real user data or payments.
In scope: the code in this repository (authentication, authorization, payments architecture, webhooks,
uploads, data handling). Out of scope: third-party services themselves, denial-of-service testing,
social engineering, and any testing against infrastructure you do not own.

## Good-faith research

We will not pursue action against good-faith research that avoids privacy violations, data destruction
and service disruption, and that is reported privately as described above.

## Security design

The threat model and controls are documented in [docs/11-security-threat-model.md](docs/11-security-threat-model.md).
