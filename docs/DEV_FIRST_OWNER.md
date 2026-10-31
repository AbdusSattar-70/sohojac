# Fresh Sohojac dev: first owner setup

**Environment:** `dev` Worker at https://sohojac-dev.a90-sattar.workers.dev  
**Database:** independent Cloudflare D1 **`sohojac_dev`**, **not `sohojac`**  
**Status:** repeat this first-owner setup after the owner-authorized mock dev reset in PR #60 successfully deploys. Earlier development credentials no longer exist.

The new development D1 intentionally has **no staff, students, guardians, enquiries,
admissions, receipts, expenses, public programme offerings or batches**. It starts
with core accounting reference accounts and independently seeded academic
Classes 1–12, guardian relationships and the global subject directory. No
production sign-in details or passwords are copied. All four canonical
migrations create schema only (plus approved finance master accounts).

## 1. Generate a one-time setup ticket on your computer

On Linux run:

```bash
openssl rand -hex 32
```

Copy the **64 hexadecimal characters** privately. Keep it out of GitHub
commits, issues, CI logs and ChatGPT. Generate a new ticket if it is leaked.

## 2. Issue the owner ticket in development D1 only

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/) open **Storage & databases → D1** (menu wording may vary).
2. Select the database whose **name is exactly `sohojac_dev`**. Double-check the UUID differs from production `sohojac`.
3. Open the D1 **Console** and run this SQL, replacing the three placeholders
   with your own dev-only staff email, display name and ticket.

```sql
INSERT INTO staff_owner_setup
  (id, email, display_name, token, expires_at)
VALUES
  ('first-owner',
   'YOUR-DEV-OWNER-EMAIL@example.com',
   'Development Owner',
   'PASTE_YOUR_64_HEX_CHARACTER_TICKET_HERE',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 minutes'));
```

The database refuses malformed 64-character tickets. Use an email address
you control. This ticket is **valid for 30 minutes** and can create only the
first owner. Do not run this SQL against `sohojac`.

If a ticket expired **before it was consumed**, generate a new one and,
while there is no owner, update only that unconsumed dev ticket:

```sql
UPDATE staff_owner_setup
SET token = 'PASTE_NEW_64_HEX_CHARACTER_TICKET_HERE',
    expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 minutes')
WHERE id = 'first-owner' AND consumed_at IS NULL;
```

## 3. Create your development owner login

1. Open **https://sohojac-dev.a90-sattar.workers.dev/setup-owner**.
2. Enter the exact ticket from step 1.
3. Choose a strong, **dev-only** password (not your production password).
4. Complete Cloudflare Turnstile and confirm setup.
5. Sign in at **https://sohojac-dev.a90-sattar.workers.dev/sign-in** using the email and password you just created.

The setup endpoint atomically consumes the ticket and creates a Better Auth
credential and active **OWNER** membership; it rejects reuse and blocks
anonymous sign-up. The login is specific to the development D1.

## 4. Optional safe verification in dev D1 Console

Read status only (never copy the password hash or ticket):

```sql
SELECT id, email, consumed_at IS NOT NULL AS used FROM staff_owner_setup;
SELECT m.role, m.active, u.email
  FROM staff_memberships m JOIN "user" u ON u.id=m.user_id;
SELECT (SELECT COUNT(*) FROM academy_students) AS students,
       (SELECT COUNT(*) FROM finance_payments) AS payments;
```

Expect exactly one active OWNER and **zero** students and payments until
you deliberately add test records. Once configured, create your first
programme and publish its fee plan, then its first 12-seat batch. There
is **no** factory admin password.

## Troubleshooting

- **Ticket unavailable/expired:** ensure you inserted into `sohojac_dev`,
  used a 64-character lowercase hexadecimal value, and it is still within
  30 minutes. A consumed ticket cannot be used again.
- **Turnstile unavailable:** confirm the dev widget is allowed on
  `sohojac-dev.a90-sattar.workers.dev` and GitHub has
  `DEV_TURNSTILE_SITE_KEY` (variable) and `DEV_TURNSTILE_SECRET_KEY` (secret).
- **Sign-in fails:** confirm `DEV_BETTER_AUTH_SECRET` is configured and
  the `BETTER_AUTH_URL` matches the dev domain. Do not copy production
  authentication tables, cookies or secrets.
- **Can't find the database:** dev provisioning/migration must finish
  first; see [Actions releases](https://github.com/AbdusSattar-70/sohojac/actions/workflows/erp-ci.yml).
- **Security:** Cloudflare dashboard and D1 SQL access grant very high privileges.
  Do not issue first-owner tickets to other people. Use the ERP staff access
  and invitation workflow for further staff after first login.

## Release guarantee

Reset and clean bootstrap apply **only to `sohojac_dev`** under a guarded
one-time operation. Existing production `sohojac` and `master` remain
unchanged. The owner must test the dev ERP and explicitly approve any future
promotion to `master`; no automatic production release is authorized.
