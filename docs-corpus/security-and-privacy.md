# Security and Privacy

## Encryption

Data is encrypted in transit with TLS 1.2 or higher, and at rest with AES-256. TaskLoop does not offer customer-managed encryption keys (BYOK) on any plan.

## Hosting and data residency

TaskLoop runs on AWS in us-east-1 by default. EU data residency (eu-central-1) is available on the Team plan and must be selected at workspace creation; existing workspaces cannot be migrated between regions.

## Authentication

All plans support email and password with optional TOTP two-factor authentication. Password minimum length is 12 characters. SAML SSO and SCIM provisioning are Team plan only. Team workspaces can enforce SSO, which disables password login for all members except the workspace owner (retained as a break-glass account).

Sessions expire after 30 days of inactivity, or 12 hours for workspaces with SSO enforcement enabled.

## Permissions

Roles are Owner, Admin, Member, and Guest. Guests can be restricted to specific boards and are available on Pro and Team. There is exactly one Owner per workspace; ownership can be transferred by the current Owner from Settings > Members.

## Compliance

TaskLoop maintains SOC 2 Type II certification, audited annually. The current report is available under NDA to Team plan customers on request. TaskLoop is GDPR compliant and will execute a Data Processing Agreement (DPA) with any paying customer. TaskLoop is not HIPAA compliant and must not be used to store protected health information. There is no FedRAMP or ISO 27001 certification at this time.

## Subprocessors

A current subprocessor list is published at taskloop.com/subprocessors. Customers can subscribe to email notification of subprocessor changes, which are announced 30 days before taking effect.

## Vulnerability reporting

Report security issues to security@taskloop.com. TaskLoop acknowledges reports within 2 business days. There is a bug bounty program with rewards from $100 to $5,000 depending on severity.
