# Sohoj Academy email setup (Resend)

1. In https://resend.com/domains verify **sohojac.com**. Add exactly the
   sending DKIM, SPF and required MX records Resend displays to Cloudflare
   DNS. Avoid conflicting/duplicate SPF or MX records.
2. In Resend → API Keys create a **Sending access** API key scoped to
   sohojac.com.
3. In GitHub `AbdusSattar-70/sohojac` → Settings →
   Secrets and variables → Actions, create:
   - **Repository secret**: `RESEND_API_KEY` = the new private key.
   - **Repository variable**: `STAFF_EMAIL_FROM` =
     `Sohoj Academy <admission@sohojac.com>`
     (plain `admission@sohojac.com` also works).
4. Trigger a new tested deployment from `master` so the production Worker
   receives both values. Do not share or commit the key.
5. From an authorized account send a staff invitation to an approved
   applicant and request a password reset for an existing active staff account.
   Verify messages arrive, links work, and access rules remain enforced.

Resend is for **outgoing** ERP email; to receive mail at your domain,
configure Cloudflare Email Routing or a separate mail provider. Students
and guardians do not get ERP login or email; guardian notices are SMS only.

Without verified mail configuration, invitation and password recovery remain
disabled. Keep existing Better Auth and Turnstile secrets unchanged.
