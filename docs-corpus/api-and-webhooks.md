# API and Webhooks

## Access

The REST API is available on Pro and Team only. The Free plan has no API access. The base URL is `https://api.taskloop.com/v1`.

## Authentication

Requests authenticate with a bearer token: `Authorization: Bearer <token>`. Tokens are created under Settings > API Tokens. A workspace can hold up to 10 active tokens. Tokens are shown once at creation and cannot be retrieved later; a lost token must be revoked and replaced. Tokens do not expire automatically but can be revoked at any time, which takes effect within 60 seconds.

## Rate limits

The API is rate limited to 100 requests per minute per workspace, counted across all tokens. Exceeding the limit returns HTTP 429 with a `Retry-After` header in seconds. Rate limit state is exposed on every response via `X-RateLimit-Remaining` and `X-RateLimit-Reset`. The limit is the same on Pro and Team; it is not raised on request.

## Endpoints

Core resources are boards, tasks, comments, and members. Standard verbs apply: GET list, GET by id, POST create, PATCH update, DELETE. List endpoints paginate with `limit` (default 50, maximum 100) and a `cursor` parameter. Responses are JSON.

## Webhooks

Webhooks are configured per workspace under Settings > Webhooks, up to 5 endpoints. Supported events: `task.created`, `task.updated`, `task.deleted`, `comment.created`, `board.created`.

Delivery is at-least-once, so consumers must be idempotent. Each payload is signed with an HMAC-SHA256 signature in the `X-TaskLoop-Signature` header; verify it against the endpoint's signing secret.

Failed deliveries (non-2xx or timeout after 10 seconds) retry with exponential backoff 5 times over roughly 1 hour. An endpoint failing continuously for 24 hours is automatically disabled and the workspace owner is emailed.

## Versioning

The API is versioned in the URL path. Breaking changes ship as a new version; TaskLoop supports the previous version for 12 months after a new one is released.
