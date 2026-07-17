# Integrations

TaskLoop supports three official integrations: Slack, GitHub, and Google Drive. All three are available on Pro and Team. The Free plan can connect Slack only, limited to 1 connected channel.

## Slack

Connect from Settings > Integrations > Slack and authorize the workspace. Capabilities:

- Post task notifications (created, assigned, completed, commented) to a chosen channel.
- Create a task from a Slack message via the `/taskloop` slash command or the message overflow menu.
- Unfurl TaskLoop links pasted into Slack with title, assignee, and status.

Limits: 10 connected channels on Pro, 50 on Team. Notification delivery is best-effort with a typical delay under 10 seconds. Slack integration does not sync comments back into TaskLoop.

## GitHub

Available on Pro and Team. Connect via GitHub OAuth; a workspace can link up to 25 repositories. Capabilities:

- Link a pull request or issue to a task by pasting the URL into the task.
- Auto-transition a task to Done when a linked PR merges (configurable per board).
- Reference a task from a commit message using the task key, for example `BUG-42`.

GitHub Enterprise Server is supported on Team only, and requires a network-reachable instance. TaskLoop does not push code or create branches.

## Google Drive

Available on Pro and Team. Attach Drive files to tasks by URL or file picker. Attached files are linked, not copied, so permissions remain governed by Drive. TaskLoop shows a warning when an attached file is not visible to all task assignees. Drive attachments do not count toward TaskLoop storage limits.

## General notes

Integrations are configured per workspace, not per board or per user. Disconnecting an integration removes future syncing but leaves existing links and attachments in place. There is no public marketplace and no support for Jira, Asana, Trello, or Zapier. Custom integrations should use the public API and webhooks.
