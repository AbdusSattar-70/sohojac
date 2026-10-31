/**
 * Accessible, responsive staff invitation email. No external images, fonts,
 * tracking pixels, scripts or user-provided HTML.
 * This transactional message is not an advertising subscription.
 */
export type StaffInvitationDetails = {
  recipientName: string;
  verifiedRole: string;
  actionUrl: string;
  supportEmail: string;
  address?: string;
  expiresInHours?: number;
};

function escapeHtml(value: string) {
  return value.replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function normalize(value: string, maxLength: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,maxLength);
}

export function buildStaffInvitationEmail(details: StaffInvitationDetails) {
  const url = new URL(details.actionUrl);
  if(url.protocol !== "https:" || !(
       url.hostname === "sohojac.com" || url.hostname.endsWith(".sohojac.com") ||
       url.hostname === "sohojac-dev.a90-sattar.workers.dev"))
    throw new Error("Staff invitation must use an approved HTTPS academy URL");
  if(url.pathname !== "/accept-invitation" || !url.searchParams.get("token"))
    throw new Error("Invalid account setup link");

  const name = normalize(details.recipientName,120) || "Colleague";
  const role = normalize(details.verifiedRole,48).replace(/_/g," ");
  const safeRole = role.length ? role.charAt(0).toUpperCase()+role.slice(1).toLowerCase() : "Staff";
  const email = normalize(details.supportEmail,180);
  if(!/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(email))
    throw new Error("Verified reply-to email is required");
  const address = normalize(details.address ?? "",200) || "Jamalpur, Bangladesh";
  const hours = details.expiresInHours ?? 24;
  if(!Number.isSafeInteger(hours) || hours < 1 || hours > 168)
    throw new Error("Invalid invitation expiry");
  const nameHtml = escapeHtml(name);
  const roleHtml = escapeHtml(safeRole);
  const addressHtml = escapeHtml(address);
  const actionHref = escapeHtml(url.toString());
  const helpHref = "mailto:"+encodeURIComponent(email).replace(/%40/gi,"@");
  const helpText = escapeHtml(email);
  const preheader = "Your verified staff invitation is ready. Complete secure account setup within "+hours+" hours.";
  const title = "You're invited to Sohoj Academy";
  const subject = "Sohoj Academy | Complete your staff account setup";
  const siteUrl = "https://sohojac.com";

  // Table layout and inline CSS support Gmail, Outlook and mobile clients.
  // No personalized marketing tracking is embedded in this message.
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#eef2f7;color:#1c2940;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#eef2f7;width:100%;">
<tr><td align="center" style="padding:32px 14px 40px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:620px;width:100%;">
<tr><td style="padding:0 4px 20px;text-align:center;font-size:12px;letter-spacing:1.4px;font-weight:700;color:#425473;">SOHOJ ACADEMY <span style="color:#b48d43;">&bull;</span> DIGITAL CAMPUS</td></tr>
<tr><td style="border-radius:18px;overflow:hidden;background:#ffffff;border:1px solid #dce3ed;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
<tr><td style="padding:29px 36px;background:#111e35;border-bottom:4px solid #cba45c;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
<td width="54" valign="middle"><span style="display:inline-block;border:1px solid #d4b675;border-radius:12px;color:#f1d99c;font-size:23px;font-weight:700;text-align:center;width:42px;line-height:42px;">SA</span></td>
<td valign="middle" style="padding-left:8px;"><div style="font-size:20px;font-weight:700;letter-spacing:.2px;color:#ffffff;">Sohoj Academy</div><div style="padding-top:5px;color:#bdcbe0;font-size:12px;letter-spacing:.5px;">Focused learning. Visible progress.</div></td>
</tr></table>
</td></tr>
<tr><td style="padding:38px 36px 15px;">
<p style="margin:0 0 13px;color:#305b95;font-size:12px;letter-spacing:1.5px;font-weight:700;">STAFF ACCOUNT INVITATION</p>
<h1 style="margin:0 0 22px;font-size:27px;line-height:1.25;letter-spacing:-.4px;color:#152239;font-weight:700;">${escapeHtml(title)}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#28364c;">Hello ${nameHtml},</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#40516b;">Your staff access request has been reviewed and approved for account setup. We invite you to join the Sohoj Academy Digital Campus, where our team coordinates academics, administration, and student progress.</p>
</td></tr>
<tr><td style="padding:0 36px 25px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #dde5ef;border-radius:12px;background:#f6f9fc;">
<tr><td style="padding:18px 20px;">
<div style="font-size:12px;letter-spacing:.7px;font-weight:700;color:#58708c;">YOUR ACCESS DETAILS</div>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top:12px;font-size:14px;line-height:1.8;">
<tr><td style="color:#5b6e86;padding:3px 8px 3px 0;">Approved role</td><td align="right" style="font-weight:700;color:#192943;">${roleHtml}</td></tr>
<tr><td style="color:#5b6e86;padding:3px 8px 3px 0;">Workspace</td><td align="right" style="font-weight:700;color:#192943;">Digital Campus ERP</td></tr>
<tr><td style="color:#5b6e86;padding:3px 8px 3px 0;">Link validity</td><td align="right" style="font-weight:700;color:#192943;">${hours} hours</td></tr>
</table>
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:0 36px 20px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#1d4ed8" style="border-radius:10px;">
<a href="${actionHref}" style="display:inline-block;padding:16px 30px;border-radius:10px;color:#ffffff;font-size:16px;line-height:20px;text-decoration:none;font-weight:700;">Set up my staff account</a>
</td></tr></table>
<p style="margin:16px 0 0;color:#60718a;font-size:13px;line-height:1.6;">Create your password using the secure button above. After setup, you can sign in to your staff workspace.</p>
</td></tr>
<tr><td style="padding:0 36px 28px;">
<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#51637c;">Button not working? Copy the secure link below into your browser:</p>
<p style="margin:0;overflow-wrap:anywhere;word-break:break-all;font-size:12px;line-height:1.65;color:#1d4ed8;"><a href="${actionHref}" style="color:#1d4ed8;text-decoration:underline;">${actionHref}</a></p>
</td></tr>
<tr><td style="padding:21px 36px;background:#f8fafc;border-top:1px solid #e4eaf2;">
<p style="margin:0 0 7px;color:#243952;font-size:14px;font-weight:700;">Your security matters</p>
<p style="margin:0;color:#566880;font-size:13px;line-height:1.75;">This one-time link expires after ${hours} hours. Never forward it or share your password. We will never request your password or one-time code by email. If you did not request access, ignore this message and contact us at <a href="${helpHref}" style="color:#2455ac;text-decoration:underline;">${helpText}</a>.</p>
</td></tr>
<tr><td style="padding:24px 36px 28px;background:#ffffff;border-top:1px solid #e4eaf2;">
<p style="margin:0;color:#152239;font-size:14px;font-weight:700;">Learning made easy &amp; meaningful.</p>
<p style="margin:6px 0 13px;color:#60718a;font-size:13px;line-height:1.7;">At Sohoj Academy, focused small-batch teaching, practice, and regular assessment help learners make measurable progress.</p>
<p style="margin:0;color:#60718a;font-size:13px;line-height:1.7;">Questions? <a href="${helpHref}" style="color:#2455ac;">${helpText}</a> &nbsp;&middot;&nbsp; <a href="${siteUrl}" style="color:#2455ac;">sohojac.com</a></p>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:22px 8px 0;text-align:center;color:#697c95;font-size:12px;line-height:1.8;">
<strong style="color:#405672;">Sohoj Academy</strong> &nbsp;&bull;&nbsp; ${addressHtml}<br>
Staff account security notice &nbsp;&bull;&nbsp; <a href="${siteUrl}" style="color:#456283;text-decoration:underline;">Official website</a><br>
&copy; ${new Date().getUTCFullYear()} Sohoj Academy. This is an account-service email, not a promotional subscription.
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    "SOHOJ ACADEMY | DIGITAL CAMPUS",
    "Focused learning. Visible progress.",
    "",
    title,
    "",
    "Hello "+name+",",
    "",
    "Your staff access request has been verified and approved for account setup.",
    "You have been invited to join Sohoj Academy's Digital Campus.",
    "",
    "YOUR ACCESS DETAILS",
    "Approved role: "+safeRole,
    "Workspace: Digital Campus ERP",
    "Link validity: "+hours+" hours",
    "",
    "SET UP YOUR STAFF ACCOUNT",
    url.toString(),
    "",
    "Open this secure link to create your password and sign in.",
    "It is single-use and expires in "+hours+" hours.",
    "",
    "SECURITY NOTICE",
    "Do not share or forward this link or your password.",
    "Sohoj Academy will never request your password or one-time code by email.",
    "If you did not request access, ignore this message and contact "+email+".",
    "",
    "ABOUT SOHOJ ACADEMY",
    "Focused small-batch teaching, practice and regular assessment for measurable progress.",
    "Website: "+siteUrl,
    "Contact: "+email,
    "Location: "+address,
    "",
    "Sohoj Academy — Staff Account Services",
    "This email is related to your account request, not marketing."
  ].join("\n");

  return {subject, html, text};
}
