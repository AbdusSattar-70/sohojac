import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import {test} from "node:test";

const source=readFileSync("lib/staff-invitation-template.ts","utf8");
const compiled=stripTypeScriptTypes(source,{mode:"strip"})
  .replace(/\bexport (?=function)/g,"");
const {buildStaffInvitationEmail}=new Function(compiled+"; return {buildStaffInvitationEmail}")();
const actionUrl="https://sohojac-dev.a90-sattar.workers.dev/accept-invitation?token="+
  "a".repeat(64);
const make=(override={})=>buildStaffInvitationEmail({
 recipientName:"Sample Staff Member",
 verifiedRole:"TEACHER",
 actionUrl,
 supportEmail:"info@sohojac.com",
 address:"Verified office, Jamalpur Sadar, Bangladesh",
 ...override,
});
test("staff invitation contains branded, actionable responsive HTML and a complete text alternative",()=>{
 const {subject,text,html}=make();
 assert.match(subject,/Sohoj Academy.*account setup/i);
 for(const content of [html,text]){
  assert(content.includes("Sample Staff Member"),"Personal greeting");
  assert(content.includes("Sohoj Academy"),"Brand name");
  assert(content.includes("Teacher"),"Verified staff role");
  assert(content.includes("Digital Campus"),"Destination context");
  assert(content.includes("24 hours"),"Expiry");
  assert(content.includes("info@sohojac.com"),"Reply-to address");
  assert(content.includes("Verified office, Jamalpur Sadar, Bangladesh"),"Verified location");
  assert(content.includes(actionUrl),"Account setup link");
  assert(content.includes("sohojac.com"),"Official website");
  assert(content.includes("password"),"Security guidance");
  assert(content.includes("small-batch"),"Brief context about academy");
 }
 assert.match(html,/<html lang="en">/);
 assert.match(html,/<meta name="viewport"/);
 assert.match(html,/<table role="presentation"/);
 assert.match(html,/max-width:620px/);
 assert.match(html,/STAFF ACCOUNT INVITATION/);
 assert.match(html,/href="https:\/\/sohojac-dev\./);
 assert.match(html,/Set up my staff account/);
 assert.match(html,/display:none;font-size:1px/);
 assert.doesNotMatch(html,/<script|<img|@import|https:\/\/fonts/i);
 assert(!text.includes("<td"),"Fallback must be plain text");
 assert(!text.includes("<html"),"Fallback must not contain HTML");
});
test("unsafe dynamic names, office addresses and HTML are escaped",()=>{
 const {html,text}=make({
  recipientName:'<img src=x onerror="alert(1)">',
  verifiedRole:'ADMIN"><script>alert(1)</script>',
  address:'Main Campus <svg/onload=alert(1)> & Jamalpur',
 });
 assert(!html.includes('<img src=x'));
 assert(!html.includes('<svg/onload'));
 assert(!html.includes('<script>alert'));
 assert(html.includes("&lt;img"));
 assert(html.includes("&lt;svg"));
 assert(html.includes("&amp; Jamalpur"));
 assert(text.includes("Main Campus <svg/onload=alert(1)>"),"Plain text retains natural content");
});
test("invalid, non-HTTPS and off-domain invitation URLs are rejected",()=>{
 assert.throws(()=>make({actionUrl:"http://sohojac.com/accept-invitation?token=test"}),/approved HTTPS/);
 assert.throws(()=>make({actionUrl:"https://sohojac.com.evil.org/accept-invitation?token=test"}),/approved HTTPS/);
 assert.throws(()=>make({actionUrl:"https://evilsohojac.com/accept-invitation?token=test"}),/approved HTTPS/);
 assert.throws(()=>make({actionUrl:"https://sohojac.com/sign-in?token=test"}),/Invalid account setup/);
 assert.throws(()=>make({actionUrl:"https://sohojac.com/accept-invitation"}),/Invalid account setup/);
 assert.throws(()=>make({supportEmail:"not-an-email"}),/reply-to/);
});
test("email transport includes text, HTML, reply-to and idempotent send",()=>{
 const adapter=readFileSync("lib/staff-mail.ts","utf8");
 const action=readFileSync("modules/platform/access/actions.ts","utf8");
 const config=readFileSync("cloudflare.config.ts","utf8");
 const workflow=readFileSync(".github/workflows/erp-ci.yml","utf8");
 assert.match(adapter,/html\?: string/);
 assert.match(adapter,/replyTo\?: string/);
 assert.match(adapter,/html \? \{ html \}/);
 assert.match(adapter,/reply_to: replyTo/);
 assert.match(adapter,/Idempotency-Key/);
 assert.match(action,/buildStaffInvitationEmail\(\{/);
 assert.match(action,/recipientName:row\.full_name/);
 assert.match(action,/verifiedRole:row\.assigned_role/);
 assert.match(action,/subject:invitation\.subject/);
 assert.match(action,/html:invitation\.html/);
 assert.match(action,/text:invitation\.text/);
 assert.match(config,/STAFF_EMAIL_POSTAL_ADDRESS: bindings\.text/);
 assert.match(workflow,/DEV_STAFF_EMAIL_POSTAL_ADDRESS/);
 assert.doesNotMatch(source,/real invitation token/i);
});
