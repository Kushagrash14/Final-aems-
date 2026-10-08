# AEMS — Security Controls Document (Audit Reference)

| Item | Detail |
|---|---|
| Application | AEMS — Asset & Equipment Management System |
| Organisation | PG Groups (PG Electroplast Ltd) |
| Version / Date | v2 — 07 Oct 2026 |
| Technology | Next.js 16.4.0 (App Router, Node.js), React 19, TypeScript, MySQL (Amazon RDS), Amazon S3, SMTP (Nodemailer) |
| Repository | github.com/Kushagrash14/Final-aems- |
| System owner / Primary IT Admin | software.2040@pgel.in |
| Verification | TypeScript compile check, 29 automated route-level security tests (mock mode), `npm audit` |
| Reference frameworks | ISO/IEC 27001:2022 Annex A, OWASP ASVS 4.0.3, OWASP Top 10 (2021) |

---

## 1. Scope

This document lists every security control implemented in the AEMS application, using the **standard control name** auditors use, mapped to **ISO/IEC 27001:2022 Annex A** and **OWASP ASVS 4.0.3** chapters, with the source file as evidence. Infrastructure controls are listed in Section 14 as deployment responsibilities.

**ASVS chapter key:** V1 Architecture · V2 Authentication · V3 Session Management · V4 Access Control · V5 Validation, Sanitization & Encoding · V7 Error Handling & Logging · V8 Data Protection · V9 Communication · V11 Business Logic · V12 Files & Resources · V13 API & Web Service · V14 Configuration

---

## 2. Architecture Security Overview — *Defence in Depth*

```
Browser ──HTTPS──> (AWS ALB / CloudFront + WAF)* ──> Next.js server
                                                      │
                                                      ├─ HTTP Security Headers (CSP, HSTS, ...)
                                                      ├─ API Gateway Guard (src/proxy.ts)
                                                      │    Rate Limiting · Payload Size Limit · Origin Validation · Authentication Gate
                                                      ├─ API route: Session Validation → RBAC → Data Scope → Write Permission
                                                      ├─ Parameterised Queries → MySQL (Amazon RDS, TLS)
                                                      └─ Private Object Storage (S3, Pre-signed URLs)
* infrastructure item, see Section 14
```

Every API request passes **two independent enforcement layers** (gateway guard + per-route authorisation) — the *Defence in Depth* and *Complete Mediation* principles.

---

## 3. Identification & Authentication

| ID | Standard Control Name | Implementation in AEMS | ISO 27001:2022 | ASVS | Evidence |
|---|---|---|---|---|---|
| AUTH-01 | **Passwordless Authentication (Email OTP)** | Login by one-time password sent to the registered company email; no passwords exist or are stored. | A.8.5 Secure authentication | V2.7 Out-of-band verifier | `src/lib/auth/otp.ts` |
| AUTH-02 | **Cryptographically Secure Random Number Generation (CSPRNG)** | 6-digit OTP generated with a cryptographically secure random source. | A.8.24 Use of cryptography | V2.7.5, V6.3 | `src/lib/auth/otp.ts` |
| AUTH-03 | **Secure Credential Storage (Keyed Hashing — HMAC-SHA256)** | OTP stored only as an HMAC hash, never plain text. | A.5.17 Authentication information | V2.4 Credential storage | `src/lib/auth/otp.ts` |
| AUTH-04 | **OTP Expiry / Time-bound Credential** | OTP valid 10 minutes; earlier OTPs invalidated when a new one is issued. | A.5.17 Authentication information | V2.7.2 | `src/lib/auth/otp.ts` |
| AUTH-05 | **Maximum Attempt Limit (Credential Invalidation)** | Max 3 wrong attempts per OTP, then the OTP is void. | A.8.5 Secure authentication | V2.2.1 | `src/lib/auth/otp.ts` |
| AUTH-06 | **OTP Resend Throttling (Cooldown)** | 60-second wait between OTP requests per email. | A.8.5 Secure authentication | V2.2.1, V11.1.4 | `src/app/api/auth/send-otp/route.ts` |
| AUTH-07 | **OTP Request Quota / Anti-Email-Bombing** | Max 5 OTPs per email per 15 min (database-backed); max 20 OTP requests per IP per 15 min. | A.8.6 Capacity management | V11.1.4 Anti-automation | `src/lib/auth/otp.ts`, `send-otp/route.ts` |
| AUTH-08 | **Brute-Force Protection / Account Lockout** | 10 failed verifications per email+IP in 30 min triggers lockout (HTTP 429); max 30 verify calls per IP per 15 min. | A.8.5 Secure authentication | V2.2.1 | `src/app/api/auth/verify-otp/route.ts` |
| AUTH-09 | **Authorised User Registry / Account Status Enforcement** | Only registered, active users receive OTPs; disabled users are blocked at login and on every request. | A.5.16 Identity management, A.5.18 Access rights | V2.1, V4.1 | `send-otp`, `verify-otp`, `src/lib/auth/session.ts` |
| AUTH-10 | **Authentication Event Logging** | OTP requests, success, failure, unauthorised email, inactive user and lockout events are logged. | A.8.15 Logging | V7.2.1 | `src/lib/audit.ts` |

## 4. Session Management

| ID | Standard Control Name | Implementation in AEMS | ISO 27001:2022 | ASVS | Evidence |
|---|---|---|---|---|---|
| SES-01 | **High-Entropy Session Identifier** | 256-bit random session token per login. | A.8.5 Secure authentication | V3.2.2 | `src/lib/auth/session.ts` |
| SES-02 | **Hashed Session Token Storage** | Only an HMAC hash of the token is stored in the database. | A.8.24 Use of cryptography | V3.2.3 | `src/lib/auth/session.ts` |
| SES-03 | **Secure Cookie Attributes (HttpOnly, Secure, SameSite)** | Cookie is HttpOnly, SameSite=Lax, and Secure automatically on HTTPS. | A.8.5 Secure authentication | V3.4.1–V3.4.3 | `src/lib/env.ts`, `verify-otp/route.ts` |
| SES-04 | **Concurrent Session Control (Single Active Session)** | A new login terminates the previous session of that user. | A.8.5 Secure authentication | V3.3.4 | `src/lib/auth/session.ts` |
| SES-05 | **Idle Session Timeout (Inactivity Timeout)** | Session expires after 24 hours of inactivity. | A.8.5 Secure authentication | V3.3.2 | `src/lib/permissions.ts` |
| SES-06 | **Absolute Session Timeout** | Session expires 7 days after login regardless of activity. | A.8.5 Secure authentication | V3.3.2 | `src/lib/auth/session.ts` |
| SES-07 | **Server-Side Session Termination (Secure Logout)** | Logout deactivates the session on the server. | A.8.5 Secure authentication | V3.3.1 | `src/app/api/auth/logout/route.ts` |
| SES-08 | **Immediate Access Revocation** | Disabling/deleting a user or changing scope invalidates cached sessions at once. | A.5.18 Access rights | V3.3.3 | `src/app/api/users/route.ts` |
| SES-09 | **Secret Key Strength Enforcement** | Production refuses to start without a `SESSION_SECRET` of 32+ characters. | A.8.24 Use of cryptography | V6.4.1, V14.1 | `src/lib/env.ts` |

## 5. Access Control — *Role-Based Access Control (RBAC) + Attribute/Scope-Based Restriction*

Roles: **IT ADMIN**, **ADMIN**, **USER** (plus HR for employee records). Data scope: **Location → Plant → Department**, plus a **Read-only (can_edit)** flag.

| ID | Standard Control Name | Implementation in AEMS | ISO 27001:2022 | ASVS | Evidence |
|---|---|---|---|---|---|
| ACC-01 | **Server-Side Authorisation Enforcement (Complete Mediation)** | Every API validates session, role and scope on the server; UI hiding is not relied upon. | A.5.15 Access control | V4.1.1, V4.1.3 | all `src/app/api/**/route.ts` |
| ACC-02 | **Privileged Account Protection (Super Admin / Break-Glass Account)** | `software.2040@pgel.in` cannot be deleted, demoted or have its email changed; only it can edit itself. | A.8.2 Privileged access rights | V4.1.3 | `src/lib/permissions.ts` |
| ACC-03 | **Privileged Access Management (PAM) — Admin Provisioning Control** | Only the primary IT Admin can grant or revoke the IT Admin role. | A.8.2 Privileged access rights, A.5.18 Access rights | V4.1.3 | `src/lib/permissions.ts`, `api/users/route.ts` |
| ACC-04 | **Privilege Escalation Prevention / Least Privilege** | ADMIN can only manage USER accounts in own Location/Plant/Department; cannot change roles, scopes, IT Admins or delete users; out-of-scope values are forced back. | A.8.2 Privileged access rights, A.5.15 | V4.1.3, V4.2.1 | `src/app/api/users/route.ts` |
| ACC-05 | **Segregation of Duties (SoD)** | Master data, user deletion and system settings are IT-Admin-only; operational work by ADMIN/USER; asset approvals by Plant Head. | A.5.3 Segregation of duties | V1.4 | APIs + Settings page |
| ACC-06 | **Self-Account Deletion Prevention** | No user can delete their own account. | A.5.18 Access rights | V4.1.3 | `src/app/api/users/route.ts` |
| ACC-07 | **Master Data Change Control** | Locations, Plants, Departments: create/edit/delete by IT Admin only. | A.5.15 Access control, A.8.32 Change management | V4.1.3 | `api/locations`, `api/plants`, `api/settings/departments` |
| ACC-08 | **Data-Level Access Restriction (Application-Level Row Filtering / Scope Enforcement)** | Asset view/create/edit/delete/assign/transfer limited to user's Location/Plant/Department. Enforced in the application layer; MySQL has no native Row-Level Security (RLS) policies. | A.8.3 Information access restriction | V4.2.1 | `src/lib/permissions.ts` |
| ACC-09 | **Insecure Direct Object Reference (IDOR) Prevention** | Damaged/Missing/Scrap reports, approval status and users are checked against the requester's scope before access. | A.8.3 Information access restriction | V4.2.1 | `api/damaged-scrap`, `api/asset-approvals/[id]` |
| ACC-10 | **Read-Only Access Enforcement** | Users flagged view-only cannot create or modify records (including damage reports). | A.5.18 Access rights | V4.1.2 | `src/lib/permissions.ts` (`canUserEdit`) |
| ACC-11 | **Administrative Function Restriction** | Settings, audit logs, Smart Mail and SMTP test are IT-Admin-only. | A.8.2 Privileged access rights | V4.3.1 | Settings page & APIs |
| ACC-12 | **Authenticated Page Access (Route Protection)** | Dashboard pages redirect to `/login` without a valid session. | A.5.15 Access control | V4.1.1 | `src/app/(dashboard)/layout.tsx` |

## 6. Network & API Security

| ID | Standard Control Name | Implementation in AEMS | ISO 27001:2022 | ASVS | Evidence |
|---|---|---|---|---|---|
| NET-01 | **Deny-by-Default API Access (Authentication Gateway)** | Any `/api/*` call without a session returns 401, except whitelisted public endpoints. Blocks direct `curl`/Postman access. | A.8.20 Networks security, A.5.15 | V4.1.5, V13.1 | `src/proxy.ts` |
| NET-02 | **Rate Limiting / Request Throttling (Application-Layer DoS Protection)** | 300 req/min per IP (authenticated), 40 req/min per IP (public); HTTP 429 + Retry-After. | A.8.6 Capacity management, A.8.20 | V11.1.4, V13.1 | `src/proxy.ts`, `src/lib/rateLimit.ts` |
| NET-03 | **Request Payload Size Limit** | Requests over 25 MB rejected (413); uploads capped at 10 MB. | A.8.6 Capacity management | V12.1.1, V13.1 | `src/proxy.ts`, `api/uploads` |
| NET-04 | **Cross-Site Request Forgery (CSRF) Protection — Origin Validation** | Cross-origin POST/PUT/PATCH/DELETE rejected (403) plus SameSite cookie. | A.8.26 Application security requirements | V4.2.2, V13.2.3 | `src/proxy.ts` |
| NET-05 | **Trusted Proxy IP Resolution (IP Spoofing Prevention)** | Client IP taken from the load-balancer hop of `X-Forwarded-For`. | A.8.15 Logging, A.8.20 | V7.1, V11.1 | `src/lib/rateLimit.ts` |
| NET-06 | **Sensitive Response Caching Prevention** | API responses sent with `Cache-Control: no-store`. | A.8.12 Data leakage prevention | V8.2.1 | `src/proxy.ts` |
| NET-07 | **CORS Restriction (Same-Origin Policy)** | No cross-origin resource sharing enabled; pre-flight `OPTIONS` rejected. | A.8.26 Application security requirements | V14.5.3 | `src/proxy.ts` |

## 7. Secure Configuration — *HTTP Security Headers*

| ID | Standard Control Name | Value / Purpose | ISO 27001:2022 | ASVS | Evidence |
|---|---|---|---|---|---|
| HDR-01 | **Content Security Policy (CSP)** | Own-origin scripts/styles only, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'` — XSS mitigation. | A.8.9 Configuration management | V14.4.3 | `next.config.ts` |
| HDR-02 | **HTTP Strict Transport Security (HSTS)** | `max-age=31536000; includeSubDomains` — forces HTTPS. | A.8.24 Use of cryptography | V9.1.1, V14.4.5 | `next.config.ts` |
| HDR-03 | **Clickjacking Protection (X-Frame-Options)** | `SAMEORIGIN`. | A.8.9 Configuration management | V14.4.7 | `next.config.ts` |
| HDR-04 | **MIME-Sniffing Prevention (X-Content-Type-Options)** | `nosniff`. | A.8.9 | V14.4.4 | `next.config.ts` |
| HDR-05 | **Referrer Policy** | `strict-origin-when-cross-origin`. | A.8.12 Data leakage prevention | V14.4.6 | `next.config.ts` |
| HDR-06 | **Permissions Policy (Browser Feature Control)** | Camera self only (QR scan); microphone and geolocation disabled. | A.8.9 | V14.4 | `next.config.ts` |
| HDR-07 | **Cross-Origin Opener Policy (COOP)** | `same-origin`. | A.8.9 | V14.4 | `next.config.ts` |
| HDR-08 | **Server Fingerprinting Suppression (Banner Hiding)** | `X-Powered-By` removed; `X-Permitted-Cross-Domain-Policies: none`. | A.8.9 | V14.3.3 | `next.config.ts` |

## 8. Data Protection & Database Security

| ID | Standard Control Name | Implementation in AEMS | ISO 27001:2022 | ASVS | Evidence |
|---|---|---|---|---|---|
| DATA-01 | **SQL Injection Prevention (Parameterised Queries / Prepared Statements)** | All queries parameterised; identifiers validated against a whitelist. | A.8.28 Secure coding | V5.3.4 | `src/lib/db/client.ts` |
| DATA-02 | **Input Validation (Allow-list Validation)** | Required fields, enum allow-lists, length limits, token format checks. | A.8.28 Secure coding | V5.1.3, V5.1.4 | API routes, `pm/complaint`, `assetApprovals.ts` |
| DATA-03 | **Mass Assignment Protection** | Update APIs accept only allow-listed fields. | A.8.28 Secure coding | V5.1.2 | `api/locations/[id]`, `api/plants/[id]`, `api/users` |
| DATA-04 | **Secure Error Handling (Information Disclosure Prevention)** | Internal/DB/network errors logged server-side; users see generic messages. | A.8.12 Data leakage prevention | V7.4.1 | `src/lib/apiErrors.ts` (46 handlers) |
| DATA-05 | **Encryption in Transit (Database TLS)** | MySQL over TLS with Amazon RDS CA when `DB_SSL=true`. | A.8.24 Use of cryptography | V9.2.2 | `src/lib/db/mysql.ts` |
| DATA-06 | **Soft Delete / Record Retention** | Assets are soft-deleted and retained for history. | A.5.33 Protection of records | V8.3 | `src/app/api/assets/[id]/route.ts` |
| DATA-07 | **Data Integrity Controls (Uniqueness & Atomic Transactions)** | Unique asset code, duplicate serial/MAC prevention, atomic assignment, single-use approval decision. | A.8.26 Application security requirements | V11.1.2, V11.1.6 | `src/lib/store.ts`, `src/lib/assetApprovals.ts` |
| DATA-08 | **Data Minimisation / PII Protection** | Public QR PDF excludes employee email. | A.5.34 Privacy and protection of PII, A.8.11 Data masking | V8.3.1 | `api/qr/asset/[token]` |
| DATA-09 | **Secrets Management (No Hard-coded Credentials)** | Credentials only in environment variables; `.env` files git-ignored. | A.8.4 Access to source code, A.5.17 | V2.10.4, V14.1.3 | `.gitignore`, `src/lib/env.ts` |
| DATA-10 | **Environment Separation (Dev/Test/Prod)** | Demo/mock mode cannot run in production. | A.8.31 Separation of development, test and production environments | V14.1 | `src/lib/env.ts` |

## 9. File & Storage Security

| ID | Standard Control Name | Implementation in AEMS | ISO 27001:2022 | ASVS | Evidence |
|---|---|---|---|---|---|
| FILE-01 | **Authenticated File Upload** | Upload requires valid session. | A.5.15 Access control | V12.1 | `api/uploads` |
| FILE-02 | **File Type Allow-listing & Size Restriction** | Only images, PDF, Word, Excel; max 10 MB; empty files rejected. | A.8.7 Protection against malware | V12.1.1, V12.2.1 | `api/uploads` |
| FILE-03 | **Unpredictable Resource Naming** | Random UUID object names. | A.8.3 Information access restriction | V12.3.1 | `src/lib/storage/s3.ts` |
| FILE-04 | **Private Object Storage with Pre-signed URLs** | Downloads via authenticated route issuing short-lived signed URLs. | A.8.3, A.8.24 | V12.4, V8.2 | `api/files/[...key]` |
| FILE-05 | **Path Traversal Prevention** | Keys must start with `uploads/`, `..` rejected. | A.8.28 Secure coding | V12.3.1 | `api/files/[...key]` |

## 10. Public (Unauthenticated) Endpoint Security

| ID | Standard Control Name | Protection | ISO 27001:2022 | ASVS |
|---|---|---|---|---|
| PUB-01 | **Signed URL / Tamper-proof Token (HMAC with Timing-Safe Comparison)** — QR asset PDF | HMAC-signed token, constant-time check, deleted assets return 404, rate limited. | A.8.24 Use of cryptography | V3.5, V6.2 |
| PUB-02 | **Capability Token with Expiry & Single-Use Enforcement** — Plant Head approval link | 192-bit random token, format-checked, expires in 7 days, one decision only, mailed and audited. | A.5.15, A.8.5 | V3.5, V11.1.2 |
| PUB-03 | **Anti-Automation / Abuse Prevention** — PM complaint form | Per-IP submission limit, field length limits, priority allow-list, audited. | A.8.6 Capacity management | V11.1.4 |
| PUB-04 | **Authentication Endpoint Throttling** — OTP send/verify | See AUTH-06 to AUTH-08. | A.8.5 | V2.2.1 |

## 11. Logging & Monitoring — *Audit Trail*

| ID | Standard Control Name | Implementation in AEMS | ISO 27001:2022 | ASVS | Evidence |
|---|---|---|---|---|---|
| LOG-01 | **Security Event Logging / Audit Trail** | Every security and data-change event logged with user, role, action, table, record, changes, IP, user agent, timestamp. | A.8.15 Logging | V7.1.1, V7.2 | `src/lib/audit.ts` |
| LOG-02 | **Risk-Based Event Classification** | Each audit event is assigned a calculated risk level. | A.8.16 Monitoring activities | V7.1 | `src/lib/audit.ts` |
| LOG-03 | **Audit Log Review & Export** | IT Admin can filter (date, user, risk) and export logs to CSV. | A.8.15 Logging, A.8.16 | V7.1 | `api/audit`, Settings → Audit |
| LOG-04 | **Non-Repudiation of Approvals** | Plant Head decisions record name, remarks, time, IP and user agent, and are emailed to the requester. | A.8.15 Logging | V7.1.3 | `api/public/asset-approval/[token]` |

**Audited events:**
- **Authentication:** `OTP_REQUESTED`, `OTP_REQUEST_FAILED`, `OTP_RATE_LIMITED`, `OTP_VERIFY_RATE_LIMITED`, `LOGIN_SUCCESS`, `LOGIN_FAILED_ATTEMPT`, `LOGIN_UNAUTHORIZED_EMAIL`, `LOGIN_BLOCKED_INACTIVE_USER`, `LOGOUT`
- **User administration:** `USER_REGISTERED`, `USER_UPDATED`, `USER_DELETED`
- **Master data:** `LOCATION_CREATED/UPDATED/DELETED`, `PLANT_CREATED/UPDATED/DELETED`, `DEPARTMENT_CREATED/UPDATED/DELETED`, `CATEGORY_CREATED/UPDATED/DELETED`, `CUSTOM_FIELD_CREATE/UPDATE/DELETE`
- **Asset lifecycle:** `ASSET_CREATE`, `ASSET_UPDATE`, `ASSET_SOFT_DELETE`, `ASSET_ASSIGNMENT`, `ASSET_DEASSIGNMENT`, `ASSET_INHOUSE_DEPLOYMENT`, `ASSET_DEPARTMENT_TRANSFER`, `ASSET_BATCH_IMPORT`, `BULK_ASSET_IMPORT`, `ASSET_CATEGORY_REPAIR`, `ASSET_DUPLICATE_TYPE_APPROVED`
- **Approvals:** `ASSET_APPROVAL_REQUESTED`, `ASSET_APPROVAL_GRANTED`, `ASSET_APPROVAL_REJECTED`
- **Damage / scrap reports:** create, update and review
- **Employees:** `EMPLOYEE_CREATED/UPDATED/DELETED`
- **Maintenance:** `PM_COMPLAINT_SUBMITTED`, `PM_COMPLAINT_RESOLVED`
- **Mail:** `SMART_MAIL_CREATED`, `SMART_MAIL_SCHEDULED`, `SMART_MAIL_DELETED`, `SMART_MAIL_TEST_SENT`

## 12. Secure Development & Vulnerability Management

| ID | Standard Control Name | Implementation in AEMS | ISO 27001:2022 | ASVS | Evidence |
|---|---|---|---|---|---|
| DEV-01 | **Static Type Checking (Secure Coding Practice)** | Full TypeScript; `tsc --noEmit` passes with zero errors. | A.8.28 Secure coding | V1.1 | `tsconfig.json` |
| DEV-02 | **Software Composition Analysis (SCA) / Dependency Scanning** | `npm audit --omit=dev`: 0 vulnerabilities in production dependencies (07 Oct 2026). | A.8.8 Management of technical vulnerabilities | V14.2.1 | `package.json`, `package-lock.json` |
| DEV-03 | **Patch Management** | Next.js 16.3.4 → 16.4.0 (critical advisory), SheetJS xlsx 0.18.5 → 0.20.3, sharp and source-map-js updated. | A.8.8 Management of technical vulnerabilities | V14.2.1 | `package.json` |
| DEV-04 | **Output Encoding (XSS Prevention)** | React auto-escaping; no `dangerouslySetInnerHTML`; HTML-escaped email templates. | A.8.28 Secure coding | V5.3.1, V5.3.3 | `src/lib/mailer.ts` |
| DEV-05 | **Version Control & Change Management** | Source in GitHub; changes via branch + pull request review. | A.8.32 Change management, A.8.4 Access to source code | V1.1, V14.1 | GitHub repository |
| DEV-06 | **Security Testing (Automated Authorisation & Abuse-Case Tests)** | 29 tests: privilege escalation, super-admin protection, IDOR/scope bypass, master-data access, OTP brute force, unauthenticated API access, CSRF, payload size, flooding, error leakage, token injection — all passed. | A.8.29 Security testing in development and acceptance | V1.1 | Test run 07 Oct 2026 |

---

## 13. OWASP Top 10 (2021) Mapping

| OWASP Risk | Status | Controls |
|---|---|---|
| A01 Broken Access Control | Mitigated | ACC-01 to ACC-12, NET-01, NET-04 |
| A02 Cryptographic Failures | Mitigated | AUTH-02, AUTH-03, SES-02, SES-03, HDR-02, DATA-05 |
| A03 Injection (SQL / XSS) | Mitigated | DATA-01, DATA-02, DEV-04, HDR-01 |
| A04 Insecure Design | Mitigated | Defence in depth, ACC-02, ACC-05, DATA-07 |
| A05 Security Misconfiguration | Mitigated | HDR-01 to HDR-08, DATA-10, SES-09 |
| A06 Vulnerable and Outdated Components | Mitigated | DEV-02, DEV-03 |
| A07 Identification and Authentication Failures | Mitigated | AUTH-01 to AUTH-10, SES-01 to SES-09 |
| A08 Software and Data Integrity Failures | Mitigated | DATA-03, DATA-07, PUB-01 |
| A09 Security Logging and Monitoring Failures | Mitigated | LOG-01 to LOG-04 |
| A10 Server-Side Request Forgery (SSRF) | Not applicable | Server makes no requests to user-supplied URLs |

---

## 14. Infrastructure Controls (Deployment Responsibility)

| ID | Standard Control Name | Requirement | ISO 27001:2022 | Owner |
|---|---|---|---|---|
| INF-01 | **Encryption in Transit (TLS / HTTPS Enforcement)** | TLS certificate on AWS ALB / CloudFront; `NEXT_PUBLIC_APP_URL` set to https. | A.8.24 Use of cryptography | IT / Infra |
| INF-02 | **Web Application Firewall (WAF) & DDoS Mitigation** | AWS Shield Standard + AWS WAF rate-based and managed rule sets. | A.8.20 Networks security, A.8.6 | IT / Infra |
| INF-03 | **Network Segmentation (Database Isolation)** | RDS not publicly accessible; security group allows only the app server; `DB_SSL=true`. | A.8.22 Segregation of networks | IT / Infra |
| INF-04 | **Cloud Storage Access Control (S3 Block Public Access, IAM Least Privilege)** | Private bucket; IAM user scoped to that bucket only. | A.5.23 Information security for use of cloud services | IT / Infra |
| INF-05 | **Key & Secret Rotation** | Strong `SESSION_SECRET`; DB/SMTP credentials stored securely and rotated on staff change. | A.8.24, A.5.17 | IT Admin |
| INF-06 | **Backup & Recovery** | Daily RDS automated backups with tested restore; audit-log retention policy. | A.8.13 Information backup | IT / Infra |
| INF-07 | **Distributed Rate Limiting** | Shared store (Redis) or WAF limits if more than one app server runs. | A.8.6 Capacity management | IT / Infra |
| INF-08 | **System Hardening & OS Patch Management** | OS / Node.js patching and periodic `npm audit`. | A.8.8, A.8.9 | IT Admin |
| INF-09 | **Clock Synchronisation (NTP)** | Server time synced so audit timestamps are reliable. | A.8.17 Clock synchronization | IT / Infra |

## 15. Residual Risk Register

| ID | Risk | Rating | Treatment |
|---|---|---|---|
| RR-01 | A logged-in user holding an uploaded file's exact link can open it. | Low | Accepted — random UUID names, short-lived signed URLs. |
| RR-02 | A forwarded Plant Head approval link can be used by its holder. | Low | Mitigated — 7-day expiry, single use, fully audited. |
| RR-03 | In-memory rate-limit counters reset on server restart. | Low | Mitigated — OTP quota is database-backed; WAF recommended (INF-02). |
| RR-04 | 5 high advisories in development-only tooling (ESLint `braces`). | Low | Accepted — not part of the production build. |
| RR-05 | No independent Vulnerability Assessment & Penetration Test (VAPT) yet. | Medium | Recommended before external audit sign-off. |

---

*Prepared from source-code review and automated security testing of the AEMS repository, 07 Oct 2026.*
