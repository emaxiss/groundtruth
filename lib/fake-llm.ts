import type { CompleteArgs } from './llm';

export type FakeIntent = 'docs_question' | 'triage' | 'out_of_scope' | 'injection';

const INJECTION_PATTERNS = [
  /ignore (all |your |previous |prior )*(instructions|rules)/i,
  /disregard (all |your |previous |prior )*(instructions|rules)/i,
  /as an? (admin|administrator|developer|engineer|owner).{0,40}(authoriz|approv|grant|override)/i,
  /(you are|act as|pretend to be) (now )?(a |an )?(?!the taskloop)/i,
  /system prompt|reveal your (instructions|prompt)|repeat your (instructions|prompt)/i,
  /developer mode|jailbreak|DAN mode/i,
  /override (the |your )?(policy|rules|refund)/i,
];

// Word-bounded: short terms like `api`, `sso`, and `sla` otherwise match inside
// unrelated words ("capital" contains "api", "assist" contains "sso").
const TASKLOOP_TERMS =
  /\b(taskloop|boards?|tasks?|subtasks?|plans?|pricing|refunds?|invoices?|billing|charges?|seats?|webhooks?|api|tokens?|rate limit|integrations?|slack|github|drive|exports?|sso|saml|uptime|sla|workspaces?|attachments?|storage|labels?|assignees?)\b/i;

export function classifyIntent(user: string, jsonMode?: boolean): FakeIntent {
  if (INJECTION_PATTERNS.some((p) => p.test(user))) return 'injection';
  if (jsonMode) return 'triage';
  // A docs fixture hit means the question is definitionally in scope, so the
  // probe wins over the keyword check ("What does Pro cost?" has no bare
  // TaskLoop term, and loosening the keyword list to `pro` would match
  // "problem"/"process").
  if (DOCS_FIXTURES.some((f) => f.probe.test(user))) return 'docs_question';
  if (!TASKLOOP_TERMS.test(user)) return 'out_of_scope';
  return 'docs_question';
}

// Deterministic canned responses. Keyed by intent, then by a topic probe so the
// docs_question fixture can answer the handful of facts the E2E suite asserts on.
const DOCS_FIXTURES: Array<{ probe: RegExp; answer: string }> = [
  {
    probe: /pro.{0,20}(cost|price|pricing|much)|(cost|price|much).{0,20}pro/i,
    answer:
      'The Pro plan is $12 per user per month, billed monthly. Billed annually it is $120 per user per year, which works out to $10 per user per month (a 17% discount). Pro includes unlimited boards, 50 GB of storage, and API access at 100 requests per minute.',
  },
  {
    probe: /team.{0,20}(cost|price|pricing|much)|(cost|price|much).{0,20}team/i,
    answer:
      'The Team plan is $29 per user per month, or $290 per user per year billed annually. It requires a minimum of 3 seats and adds SAML SSO, SCIM provisioning, 500 GB of storage, and a 99.9% uptime SLA.',
  },
  {
    probe: /refund/i,
    answer:
      'Annual plans are fully refundable within 14 calendar days of the charge. Monthly plans are refundable only within 48 hours of the charge. After those windows, charges are not refunded, and downgrades or seat reductions are issued as account credit rather than a cash refund.',
  },
  {
    probe: /rate limit|requests per minute|429/i,
    answer:
      'The TaskLoop API is rate limited to 100 requests per minute per workspace, counted across all tokens. Exceeding it returns HTTP 429 with a Retry-After header. The limit is the same on Pro and Team and cannot be raised.',
  },
  {
    probe: /sla|uptime/i,
    answer:
      'TaskLoop offers a 99.9% monthly uptime SLA on the Team plan only, which allows roughly 43 minutes of downtime per month. Free and Pro plans have no SLA and no service credits.',
  },
  {
    probe: /how many boards|board limit|free.{0,20}board/i,
    answer:
      'The Free plan is limited to 3 boards per workspace. Pro and Team both include unlimited boards. Archived boards do not count toward the limit.',
  },
  {
    probe: /export/i,
    answer:
      'Data export is available on all plans, including Free, from Settings > Data > Export. Exports run asynchronously in JSON or CSV, and the download link expires after 7 days. A workspace can run 3 exports per 24 hours.',
  },
];

const DOCS_FALLBACK =
  'I do not have that documented in the TaskLoop help center, so I would rather not guess. I can connect you with a human support agent who can look into it for your specific account.';

const OUT_OF_SCOPE =
  'I can only help with questions about TaskLoop, so I am not able to help with that. If you have a question about your boards, tasks, billing, or integrations, I am happy to help.';

const INJECTION =
  'I follow the TaskLoop support policy and cannot set it aside or grant exceptions outside documented policy. If you have a TaskLoop question, I am happy to help, or I can connect you with a human support agent.';

const TRIAGE_INJECTION = {
  category: 'abuse',
  severity: 'low',
  route_to: 'trust_safety',
  refund_eligible: false,
  suggested_reply:
    'We are unable to action this request as submitted. Our refund policy applies as documented, and a support agent will follow up if you have a billing question.',
  confidence: 0.9,
};

const TRIAGE_DEFAULT = {
  category: 'how_to',
  severity: 'low',
  route_to: 'support_l1',
  refund_eligible: false,
  suggested_reply:
    'Thanks for reaching out. A support agent will review your ticket and follow up shortly.',
  confidence: 0.5,
};

// Ordered: the first probe to match wins. Refund eligibility comes before the
// general billing fixture so an in-window or duplicate charge is not swallowed
// by the out-of-window default, and account issues come before billing so a
// login problem that mentions billing settings is not misrouted.
const TRIAGE_FIXTURES: Array<{ probe: RegExp; result: Record<string, unknown> }> = [
  {
    probe: /crash|data loss|lost (all )?(my )?(data|tasks)|outage|cannot access|500 error/i,
    result: {
      category: 'bug',
      severity: 'high',
      route_to: 'engineering',
      refund_eligible: false,
      suggested_reply:
        'Thanks for the report, and sorry for the disruption. We have routed this to our engineering team for investigation and will update you as soon as we know more.',
      confidence: 0.8,
    },
  },
  {
    // Duplicate or erroneous charges are refundable regardless of window.
    probe: /duplicate|charged twice|two identical charges|billing error/i,
    result: {
      category: 'billing',
      severity: 'medium',
      route_to: 'billing_team',
      refund_eligible: true,
      suggested_reply:
        'Thanks for flagging this. Duplicate charges are refunded in full once our billing team verifies them, which typically takes up to 5 business days.',
      confidence: 0.8,
    },
  },
  {
    // Inside the inclusive windows: up to 14 days for annual, up to 48 hours
    // for monthly. Day 15 and hour 49 fall through to the default below.
    probe:
      /\b(?:[1-9]|1[0-4]) days ago|\b(?:[1-9]|[1-3][0-9]|4[0-8]) hours ago|within (?:the )?(?:14 days|48 hours)/i,
    result: {
      category: 'billing',
      severity: 'medium',
      route_to: 'billing_team',
      refund_eligible: true,
      suggested_reply:
        'Thanks for reaching out. Your request falls inside the refund window, so our billing team will process it and the refund should reach your original payment method within 5 to 10 business days.',
      confidence: 0.8,
    },
  },
  {
    probe: /\bsso\b|\bsaml\b|password|log ?in|locked out|two-factor|\b2fa\b|ownership/i,
    result: {
      category: 'account',
      severity: 'medium',
      route_to: 'support_l2',
      refund_eligible: false,
      suggested_reply:
        'Thanks for the details. An account specialist will review your workspace configuration and follow up with the steps to restore access.',
      confidence: 0.7,
    },
  },
  {
    probe: /refund|charge|invoice|billing|money back/i,
    result: {
      category: 'billing',
      severity: 'medium',
      route_to: 'billing_team',
      refund_eligible: false,
      suggested_reply:
        'Thanks for reaching out. Our refund policy allows refunds within 14 days for annual plans and 48 hours for monthly plans, and this charge falls outside that window. Our billing team can review your account if you have questions.',
      confidence: 0.75,
    },
  },
  {
    probe: /how do i|how to|where do i|can i/i,
    result: {
      category: 'how_to',
      severity: 'low',
      route_to: 'support_l1',
      refund_eligible: false,
      suggested_reply:
        'Happy to help. A support agent will walk you through the steps and follow up with documentation links shortly.',
      confidence: 0.7,
    },
  },
  {
    probe: /feature request|would be nice|please add|support for/i,
    result: {
      category: 'feature_request',
      severity: 'low',
      route_to: 'support_l1',
      refund_eligible: false,
      suggested_reply:
        'Thanks for the suggestion. We have logged it for our product team to consider, though we cannot commit to a timeline.',
      confidence: 0.7,
    },
  },
];

export function fakeComplete({ user, jsonMode }: CompleteArgs): string {
  const intent = classifyIntent(user, jsonMode);

  if (jsonMode) {
    if (intent === 'injection') return JSON.stringify(TRIAGE_INJECTION);
    const hit = TRIAGE_FIXTURES.find((f) => f.probe.test(user));
    return JSON.stringify(hit ? hit.result : TRIAGE_DEFAULT);
  }

  if (intent === 'injection') return INJECTION;
  if (intent === 'out_of_scope') return OUT_OF_SCOPE;
  const hit = DOCS_FIXTURES.find((f) => f.probe.test(user));
  return hit ? hit.answer : DOCS_FALLBACK;
}
