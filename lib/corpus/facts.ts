// Facts the guardrail and triage prompts must never lose, regardless of budget
// trimming. Keyed by document slug; each entry is compiled from docs-corpus/.
export const PINNED_FACTS: Record<string, string[]> = {
  'plans-and-pricing': [
    'Free: $0, 3 boards, 5 users, 2 GB storage, no API, no SSO, no SLA.',
    'Pro: $12/user/month or $120/user/year (equivalent to $10/user/month, a 17% discount). Unlimited boards, 50 GB, API access.',
    'Team: $29/user/month or $290/user/year. SAML SSO, SCIM, 500 GB, 99.9% SLA, audit log export. Minimum 3 seats.',
    'Pro has a 14-day free trial, once per workspace. Team has no trial.',
    'Nonprofit/education discount is 30%, requires documentation, not stackable with annual pricing.',
  ],
  'refund-policy': [
    'Annual plans: full refund within 14 calendar days of the charge, inclusive: a request exactly 14 days after the charge is day 14 and qualifies. Day 15 onward: no refund.',
    'Monthly plans: refund only within 48 hours of the charge, inclusive: a request exactly 48 hours after the charge qualifies. Hour 49 onward: no refund, including partial-month.',
    'Downgrades and seat reductions produce prorated account credit, never a cash refund.',
    'Duplicate charges and TaskLoop billing errors are always refund-eligible regardless of window; the billing team verifies and processes them in about 5 business days.',
    'Approved refunds return to the original payment method in 5-10 business days. No refunds to alternate methods, no cash equivalents.',
    'Requests outside these terms are declined and routed to the billing team. Agents cannot grant exceptions.',
  ],
  'sla-and-uptime': [
    '99.9% monthly uptime SLA is Team plan only (~43 min/month allowed downtime). Free and Pro have no SLA and no credits.',
    'Team service credits: 10% (99.0-99.9%), 25% (95.0-98.99%), 50% (below 95%). Claim within 30 days. Credits apply to future invoices, never cash.',
    'Support targets: Free ~2 business days, Pro 1 business day, Team 4 business hours (1 hour critical).',
  ],
  'api-and-webhooks': [
    'API is Pro and Team only. Rate limit is 100 requests/minute per workspace; 429 with Retry-After. Limit cannot be raised.',
    'Up to 10 API tokens per workspace, shown once at creation. Webhooks: 5 endpoints, HMAC-SHA256 signature, retry 5 times over ~1 hour, auto-disabled after 24 hours of failure.',
  ],
  'boards-and-tasks': [
    'Attachments: 25 MB/file (Free), 100 MB/file (Pro, Team). Storage: 2 GB / 50 GB / 500 GB.',
    'Activity history retention: 30 days (Free), 1 year (Pro), 3 years (Team).',
  ],
  'security-and-privacy': [
    'TLS 1.2+ in transit, AES-256 at rest. No customer-managed keys on any plan.',
    'SOC 2 Type II certified, GDPR compliant, DPA available to paying customers. NOT HIPAA compliant. No FedRAMP or ISO 27001.',
    'EU data residency is Team-only and must be chosen at workspace creation. No region migration.',
  ],
  'billing-and-invoices': [
    'Failed payments retry on days 1, 3, and 7; after the third failure the workspace becomes read-only (data intact) until payment succeeds.',
    'Invoices are PDF, available under Settings > Billing, retained 7 years.',
  ],
  'data-export': [
    'Export is available on all plans, JSON or CSV, async, download link expires after 7 days. 3 exports per 24 hours.',
    'Audit log export is Team only. No importer for Jira/Trello/Asana. Import capped at 10,000 tasks per run.',
  ],
  integrations: [
    'Official integrations: Slack, GitHub, Google Drive. Pro and Team get all three; Free gets Slack only with 1 channel.',
    'No Jira, Asana, Trello, or Zapier support. No marketplace. GitHub Enterprise Server is Team only.',
  ],
  'account-deletion': [
    'Workspace deletion has a 30-day recoverable grace period, then is permanent and unrecoverable.',
    'Deleting a workspace does not trigger a refund; the standard refund policy applies. Billing records are retained 7 years and are exempt from GDPR erasure.',
  ],
  'getting-started': [
    'Free plan: 3 boards, 5 users per workspace (pending invites count). Invitations expire after 7 days.',
  ],
  'troubleshooting-common-errors': [
    'Common errors: board/seat limit (Free plan), 429 (rate limit), 401 (revoked token), read-only workspace (failed payment), attachment size cap.',
  ],
};
