# AEMS – Security Audit Executive Summary

| Field | Value |
|---|---|
| Application | AEMS – Asset Entry Management System (PG Electroplast Ltd) |
| Date | 8 October 2026 |
| Assessment type | Internal static code / configuration review – **not** a penetration test or certification |
| Scope | Repository branch `vikas-security-scope-updates` (commit `73d1d4e`) plus uncommitted working-tree changes |
| Full report | `technical-documentation/AEMS_Technical_Documentation_Security_Audit.md` |

---

## 1. Purpose and Architecture

AEMS registers, tracks, assigns, transfers, maintains and retires company assets across locations and plants. It is a single **Next.js 16 / React 19 / TypeScript** application deployed on **AWS EC2** behind **Nginx**, managed by PM2 as one process. It uses **AWS RDS MySQL 8** for data, **AWS S3** for private file storage, and **Office 365 SMTP** for login codes and notifications. A gateway file (`src/proxy.ts`) checks every API call before it reaches the route handlers.

## 2. Database

- There are 23 InnoDB tables with UUID keys and UTC timestamps. Foreign keys protect the main business relationships, and assets are soft-deleted.
- All queries go through one custom query builder. It sends values as parameters and validates table and column names, so the reviewed code showed no SQL-injection route.
- MySQL has no built-in row-level security, so separation between plants depends entirely on application code.
- Schema changes come from one SQL file plus some tables that the app creates at runtime. There is no migration versioning.

## 3. Authentication and Authorization

- **Login:** passwordless. A 6-digit code is emailed, expires after 10 minutes, and allows 3 attempts. The code and the session token are stored only as HMAC hashes.
- **Sessions:** only one active session per user. Sessions expire after 24 hours idle and 7 days absolute. The cookie is HttpOnly and SameSite=Lax; whether it is also Secure depends on configuration.
- **Roles:** `it_admin`, `admin`, `hr`, `user`. A fixed **Primary IT Admin** account is the only one that can grant IT Admin rights or change other IT Admin accounts.
- **Scope:** Admin and User accounts are limited to the locations, plants and departments assigned to them (several of each are supported).

## 4. Key Verified Controls (found and confirmed in code)

1. Queries are parameterised, table and column names are validated, and UPDATE/DELETE statements without a WHERE condition are refused.
2. Login codes and session tokens are stored hashed; random values come from a secure random generator; there are idle and absolute timeouts and a single-session rule.
3. The API gateway applies rate limits, blocks cross-site requests that change data, requires a session cookie, and caps request size.
4. Security headers are set: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy.
5. Pages are protected on the server, and every non-public API route checks the session.
6. Asset list, dashboard, lookup and PM reads are filtered by the user's assigned plants and departments.
7. Error messages are masked, demo/mock mode is refused in production, files are kept private in S3 and opened through 5-minute signed links, and most write actions are recorded in the audit log.
8. Production dependencies had **0 known vulnerabilities** in the `npm audit` run on 8 October 2026.

## 5. Critical and High Risks

No **Critical** findings were confirmed in code. Six **High** findings were identified:

| ID | Finding | Why it matters |
|---|---|---|
| AEMS-R-001 | Any logged-in user can create a QR link for **any** asset. The public QR page shows the employee and asset details, and the links never expire. | Employee and asset data from other plants can be exposed. |
| AEMS-R-002 | When updating an asset, users can change fields such as `is_deleted` and `status` directly. | Anyone with edit rights can delete or scrap an asset without the approval workflow. |
| AEMS-R-003 | The person requesting a duplicate-asset approval chooses who approves it. | People can approve their own requests. |
| AEMS-R-004 | Creating, editing and deleting employees does not check the admin's plant or department. | Employee records in other plants can be changed. |
| AEMS-R-005 | Any user with edit rights can add fields to the shared asset forms. | Shared configuration can be changed without IT Admin control. |
| AEMS-R-006 | Admins see audit logs from every plant, and the CSV export does not neutralise spreadsheet formulas. | Data from other plants is visible, and opening an export in Excel carries a formula-injection risk. |

Infrastructure controls (backups, encryption, network exposure) **could not be verified** from the repository (AEMS-R-015). They are high-impact if misconfigured.

## 6. Database Observations

- **Verified:** parameterised data access, foreign keys, unique constraints, ENUM value lists, and a lock that prevents duplicate serial numbers in concurrent saves.
- **Gaps:**
  - The organisation columns on `users` have no foreign keys.
  - Nothing at database level stops audit logs from being deleted; protection exists only because the app never does it.
  - TLS to the database is optional (`DB_SSL`).
  - Two tables are created by the app at runtime.
  - There are no versioned migrations.
- **Not verified (outside the repository):**
  - least-privilege grants for the database user
  - RDS encryption at rest
  - automated backups and point-in-time recovery
  - forced TLS on RDS
  - RDS not being publicly reachable

## 7. Cross-Plant Isolation Assessment

**Overall: Partial.**

**Isolation works for:** asset reads and creation, asset detail, the dashboard, lookups, locations, plants and departments, damage/scrap and PM reads.

**Isolation is missing or incomplete for:**
- QR token creation
- employee writes
- the audit log
- department and destination checks on assign, de-assign and transfer
- admin asset import
- PM complaint updates
- serial/MAC duplicate checks (low impact)
- shared category settings

The HR role is not scope-limited, and category-level scoping is not enforced.

## 8. Audit Readiness and Gaps

| Area | Readiness |
|---|---|
| Access control design | Good basic design; implementation gaps listed above |
| Authentication / session | Mostly verified; no second login factor; registered emails can be discovered; rate limits are kept in memory |
| Audit trail | Present. Some events are not logged (uploads, SMTP test, damage-report edits), some entries record the wrong role or no IP, logs can be deleted at database level, and there is no alerting |
| Change management | Git and PRs are used, but there is no CI pipeline, no automated tests, and deployment is manual |
| Backup / DR | No evidence in the repository; RTO and RPO are not defined |
| Compliance (OWASP / ASVS / ISO 27001) | Readiness mapping only. **Not compliant or certified on current evidence** |

## 9. Top 5 Recommendations

1. **(P0)** Remove lifecycle fields (`is_deleted`, `deleted_*`, `status`, `created_by`) from the fields users can update on an asset (AEMS-R-002).
2. **(P0)** Add plant/department scope checks to QR token creation, employee writes and category-field changes, and reduce the data shown on the public QR page (AEMS-R-001, R-004, R-005).
3. **(P1)** Have the server decide who approves duplicate-asset requests, limit audit-log access by scope, and make CSV exports safe in spreadsheets (AEMS-R-003, R-006).
4. **(P1)** Complete the infrastructure checklist in §19.9 of the full report and keep the evidence (AEMS-R-015). It covers RDS backups and encryption, TLS, network exposure, S3 settings and the IAM role.
5. **(P2)** Add a CI pipeline (lint, type check, tests, `npm audit`), versioned database migrations, database-level protection for audit logs, and a shared rate-limit store (AEMS-R-016, R-017, R-011).

## 10. Items Requiring Administrator Confirmation

- RDS: not publicly accessible; security group allows only the EC2 server; encryption at rest; `require_secure_transport`; automated backups, retention and a restore test.
- Grants for the application database user (`aems_app`).
- S3 bucket: public access blocked, default encryption, versioning; EC2 IAM role limited to `uploads/*`.
- EC2: port 3000 not exposed; TLS certificate and HTTP-to-HTTPS redirect; OS patching; SSH hardening.
- Production settings (values must not be shared):
  - `DB_SSL=true`
  - `SESSION_COOKIE_SECURE` enabled
  - `NEXT_PUBLIC_APP_URL` set to the HTTPS URL
  - a strong `SESSION_SECRET` with a rotation procedure
- CloudTrail, log retention and PM2 log rotation.
- MFA on Microsoft 365 mailboxes used by administrators and by the OTP sender account.
- GitHub branch protection on `main`.
- Business-defined RTO and RPO.

---

## Verified Facts vs Assumptions

| Category | Items |
|---|---|
| **Verified facts** (inspected in source) | Tech stack and versions, schema and constraints, authentication and session logic, RBAC rules, API routes and HTTP methods, findings AEMS-R-001 to R-014 and R-016 to R-021, security headers, PM2/Nginx templates, `npm audit` results on 8 October 2026 |
| **Documented but not verified** | AWS EC2/RDS/S3 setup, IAM role, `aems_app` privileges and the TLS setup, all as described in `aws/DEPLOY.md` and templates |
| **Assumptions / unknown** | Production environment values, backups, encryption at rest, monitoring, actual network exposure, mailbox MFA |

This summary does not claim AEMS is fully secure, compliant or penetration-tested. All findings are **Open** until fixed and retested.
