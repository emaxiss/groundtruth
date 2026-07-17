# Data Export

## Self-serve export

Any workspace owner or admin can export workspace data from Settings > Data > Export. Exports are available on all plans, including Free.

Formats:

- JSON: complete structured export of boards, tasks, comments, labels, and members.
- CSV: one file per board, containing task key, title, description, assignee, status, labels, due date, and timestamps.

Attachments are included as files in the archive on Pro and Team. On the Free plan the archive contains attachment metadata and download URLs rather than the files themselves.

## Timing and delivery

Exports are generated asynchronously. Small workspaces typically complete in under 5 minutes; large workspaces can take up to 24 hours. When ready, the requester receives an email with a download link. The link expires after 7 days, and the archive is deleted from TaskLoop storage at that point. A workspace can run 3 exports per 24 hours.

## Board-level export

An individual board can be exported to CSV from the board overflow menu. This is synchronous and downloads immediately for boards under 5,000 tasks. Larger boards fall back to the asynchronous workspace export flow.

## Audit log export

Audit log export is a Team plan feature. It covers member changes, permission changes, integration connections, token creation, and billing events, in JSON or CSV, for the workspace's 3-year retention window.

## Imports

TaskLoop imports from CSV using the same column layout as the CSV export. There is no importer for Jira, Trello, or Asana. Import is capped at 10,000 tasks per run.

## What is not included

Exports do not include deleted tasks past the 7-day trash grace period, archived boards older than 30 days, or activity history beyond the plan's retention window. There is no live export API endpoint; exports are the supported path for bulk data retrieval.
