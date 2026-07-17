# Account and Workspace Deletion

## Deleting your user account

Any user can delete their own account from Settings > Account > Delete account. Deletion requires password confirmation, or SSO re-authentication on Team workspaces with SSO enforced.

A user account cannot be deleted while that user is the Owner of a workspace. Ownership must first be transferred to another member, or the workspace itself deleted.

Deleting a user removes their profile and unassigns their tasks. Comments and activity entries authored by that user are retained but attributed to "Deleted user", because removing them would break the audit history other members rely on.

## Deleting a workspace

Only the Owner can delete a workspace, from Settings > General > Delete workspace. The Owner must type the workspace name to confirm.

Deletion enters a 30-day grace period. During the grace period the workspace is inaccessible to all members but fully recoverable by the Owner from the recovery email link. After 30 days, deletion is permanent and TaskLoop cannot restore the data under any circumstances.

Deleting a workspace on a paid plan cancels the subscription at the end of the current billing period. It does not trigger a refund; the standard refund policy applies (14 days for annual, 48 hours for monthly).

## Export before deleting

Run a data export before deleting. Export archives are unavailable once deletion is confirmed, and the download link from any prior export expires on its normal 7-day schedule regardless of workspace state.

## GDPR erasure requests

Data subjects can request erasure at privacy@taskloop.com. TaskLoop responds within 30 days as required by GDPR. Erasure requests are honored subject to legal retention obligations: billing records are retained for 7 years for tax purposes and cannot be erased on request.

## Backups

Deleted data persists in encrypted backups for up to 35 days after permanent deletion, after which backups rotate out. Backups are not customer-accessible and cannot be used to restore an individual workspace.
