# Troubleshooting Common Errors

## "Board limit reached"

The workspace is on the Free plan and already has 3 boards. Archive an unused board or upgrade to Pro. Archived boards do not count toward the limit.

## "Seat limit reached" when inviting

The Free plan allows 5 users, and pending invitations count toward that total. Revoke stale invitations under Settings > Members > Pending, or upgrade.

## Verification email never arrives

Check spam first. Resend from the login screen, limited to 5 resends per hour. Corporate mail filters are the most common cause; ask IT to allowlist `noreply@taskloop.com`.

## HTTP 429 from the API

The workspace exceeded 100 requests per minute. Honor the `Retry-After` header and back off. The limit is per workspace across all tokens and cannot be raised.

## HTTP 401 from the API

The token was revoked, mistyped, or belongs to a deleted workspace. Tokens are shown only once at creation, so a lost token must be revoked and replaced.

## Webhook endpoint stopped receiving events

Endpoints that fail continuously for 24 hours are disabled automatically and the Owner is emailed. Re-enable under Settings > Webhooks after fixing the endpoint. Confirm the endpoint returns 2xx within 10 seconds and verifies the `X-TaskLoop-Signature` HMAC.

## Workspace is read-only

Payment failed three times (retried on days 1, 3, and 7). Data is intact and viewable. Update the payment method under Settings > Billing; access restores immediately after a successful charge.

## Slack notifications delayed or missing

Delivery is best-effort, typically under 10 seconds. Check the channel is still connected and the TaskLoop app has not been removed from the Slack workspace. Free plan supports 1 channel only.

## Attachment upload fails

Attachments are capped at 25 MB per file on Free and 100 MB on Pro and Team. Also check total workspace storage: 2 GB Free, 50 GB Pro, 500 GB Team.

## Task stuck after PR merge

Auto-transition is per-board and off by default. Enable it in board settings, and confirm the PR was linked to the task.
