# Security review and remediation decision

Date: 2026-10-31

## Scope

Static review of the backend authentication, admin authorization, company document handling, tender AI analysis, backup handling, deployment configuration, and repository contents. No live system was attacked and no tests were run.

## Findings and changes

### Critical: default admin and signing secrets

- Removed hard-coded JWT and admin secret defaults from `backend/src/config/env.js`.
- Production now requires JWT access and refresh secrets of at least 32 characters, an admin secret of at least 32 characters, and a configured admin email.
- Removed admin authorization's fallback to the general JWT access secret. Admin bearer tokens must use the dedicated admin key; key plus authorized email remains supported.
- Required operator action: rotate any secrets that were ever deployed or committed. Use new independent random values in the hosting secret manager.

### High: database archives in Git

- Removed tracked database `.json.gz` exports and the full backup ZIP from the repository working tree/index.
- Added ignore rules for future `backend/backups/*.zip` and `backend/backups/*.gz` files.
- Required operator action: purge these blobs from GitHub history (for example with `git filter-repo` and a coordinated force push) and rotate credentials contained in the archives. Removing files in this change does not erase prior commits, clones, or cached copies.
- Production backup service already uploads database archives to a separate R2 backup bucket when that bucket is configured. Confirm that the bucket is private and that backup credentials have write/read access only as required.

### High: refresh token accepted after logout

- `verifyToken` now checks the presented refresh token against the per-user token stored in Redis before it can mint an access token or authorize the request.
- Logout deletes only the matching active refresh token, and middleware rejects revoked refresh tokens.
- Logout also puts the current access token's SHA-256 digest in Redis until its expiry; authenticated and optional-auth paths reject that access token immediately.
- The explicit `/auth/refresh` endpoint already performed this Redis comparison.

### High: company file upload and access

- Replaced the mock URL with a five-minute, organization-scoped R2 PUT URL.
- Confirmation accepts only a key under the caller's organization prefix and verifies object metadata and size against R2 before storing it.
- Document listing returns short-lived signed download URLs only for that organization's records. Deletion checks organization ownership and removes the R2 object.
- Added a 15 MB upload limit and the model now stores the private object key and metadata rather than a client-controlled URL.
- Required operator action: configure the R2 account, bucket, and credentials; keep the bucket private. Existing company document records stored with `url` need a migration before this schema change can serve them.

### High: placeholder AI and inactive worker

- Removed fabricated AI results. An absent or dummy Gemini key now fails closed; the endpoint returns 503 when AI is not configured.
- The analysis route now queues a URL already stored on the tender record; the worker downloads it through the trusted private R2 helper, validates PDF signature and size, extracts real text, computes a SHA-256 hash, then calls the model. PDF parsing stays out of public HTTP request handlers.
- Tender analysis uses the configured Google Gemini SDK and `GEMINI_MODEL`; it validates Gemini's JSON response and stores a provider-neutral response field.
- The AI worker is started with the API server and standalone worker entry point, with failure logging and graceful shutdown in the API process.
- Render reads `GEMINI_API_KEY` as a dashboard-managed secret and sets the configured model.
- Required operator action: ensure the Gemini key is configured in the deployment environment to enable analysis.

## Remaining release actions

1. Configure and rotate production admin/JWT/Gemini/R2 secrets as needed.
2. Ensure R2 backup and document buckets are private and use least-privilege credentials.
3. Purge historical backup blobs from GitHub history and rotate any credentials or personal data exposed in those archives.
4. Migrate any existing `CompanyDocument` records from URL fields to private R2 keys before rollout.
5. Run the project's verification suite and exercise upload, download, logout revocation, admin rejection, and AI queue flows in a staging environment.

## Limits of this review

This was a code and repository inspection, not a penetration test against a deployed environment. It does not establish whether old credentials remain active, whether R2 buckets are public, or whether GitHub history has already been copied by third parties.
