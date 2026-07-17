# SLA and Uptime

## Availability commitment

TaskLoop offers a contractual 99.9% monthly uptime SLA on the Team plan only. Free and Pro plans have no SLA and no service credits, regardless of outage length. Pro customers can view the same public status page but are not entitled to compensation.

99.9% monthly uptime allows approximately 43 minutes of downtime per 30-day month.

## What counts as downtime

Downtime is any period where the TaskLoop web app or API returns errors for more than 5% of requests for a sustained 5 minutes, as measured by TaskLoop's monitoring. Excluded from the calculation:

- Scheduled maintenance announced at least 72 hours in advance (capped at 4 hours per quarter).
- Issues caused by customer configuration, customer networks, or third-party integrations such as Slack, GitHub, or Google Drive.
- Force majeure events.

## Service credits

Team customers who fall below the commitment can claim credits against the following month's invoice:

- 99.0% to 99.9%: 10% credit
- 95.0% to 98.99%: 25% credit
- Below 95.0%: 50% credit

Credits are not automatic. A claim must be submitted within 30 days of the end of the affected month, including dates and times of impact. Credits are applied to future invoices only and are never paid out as cash refunds. Total credits in any month cannot exceed 50% of that month's fees.

## Support response targets

These are targets, not contractual guarantees, and are separate from the uptime SLA:

- Free: in-app chat, best effort, typically 2 business days
- Pro: 1 business day for normal issues
- Team: 4 business hours for normal issues, 1 hour for critical (production down)

## Status

Live status and incident history are published at status.taskloop.com. Subscribe there for email or webhook incident notifications.
