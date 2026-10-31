import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import {test} from "node:test";

const source = readFileSync("lib/staff-mail.ts","utf8");
const transpiled=stripTypeScriptTypes(source,{mode:"strip"})
  .replace(/^import .*;\r?\n/gm,"")
  .replace(/\bexport (?=(?:async )?function)/g,"");

function adapter(env,send){
 return new Function("env","fetch",transpiled+
   ";return {getStaffMailConfiguration,staffMailConfigured,staffMailRecipientAllowed,sendStaffEmail}")(env,send);
}
const input={
 recipient:"approved@example.invalid",
 subject:"Sohoj Academy test invitation",
 text:"Synthetic invitation for a test user",
 idempotencyKey:"staff-invite-synthetic",
};
test("mail remains disabled when no key, sender or dev recipient allowlist",async()=>{
 let hits=0;
 const env={STAFF_EMAIL_REQUIRE_ALLOWLIST:"true"};
 const mail=adapter(env,async()=>{hits++;return new Response(null,{status:202});});
 assert.equal(mail.staffMailConfigured(),false);
 assert.deepEqual(mail.getStaffMailConfiguration(),{
  provider:"Resend",apiKeyConfigured:false,senderConfigured:false,
  restrictedToTestRecipients:true,allowlistConfigured:false,ready:false,
 });
 await assert.rejects(()=>mail.sendStaffEmail(input),/not configured/);
 env.RESEND_API_KEY="synthetic-key";
 assert.equal(mail.staffMailConfigured(),false);
 env.STAFF_EMAIL_FROM="Sohoj Academy <info@sohojac.com>";
 assert.equal(mail.staffMailConfigured(),false);
 env.STAFF_EMAIL_ALLOWLIST=" approved@example.invalid ";
 assert.equal(mail.staffMailConfigured(),true);
 assert.equal(hits,0);
});
test("test-recipient allowlist blocks unapproved addresses before calling provider",async()=>{
 const env={
  STAFF_EMAIL_REQUIRE_ALLOWLIST:"true",
  RESEND_API_KEY:"synthetic-key",
  STAFF_EMAIL_FROM:"Sohoj Academy <info@sohojac.com>",
  STAFF_EMAIL_ALLOWLIST:"APPROVED@example.invalid, second@example.invalid",
 };
 const requests=[];
 const mail=adapter(env,async(url,options)=>{
  requests.push({url,options});
  return new Response('{"id":"synthetic"}',{status:200});
 });
 assert.equal(mail.getStaffMailConfiguration().ready,true);
 assert.equal(mail.staffMailRecipientAllowed("approved@example.invalid"),true);
 assert.equal(mail.staffMailRecipientAllowed("unapproved@example.invalid"),false);
 await assert.rejects(
   ()=>mail.sendStaffEmail({...input,recipient:"unapproved@example.invalid"}),
   /not allowlisted/
 );
 assert.equal(requests.length,0);
 await mail.sendStaffEmail(input);
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,"https://api.resend.com/emails");
 assert.equal(requests[0].options.headers["Idempotency-Key"],input.idempotencyKey);
 assert.equal(requests[0].options.headers.Authorization,"Bearer synthetic-key");
 const payload=JSON.parse(requests[0].options.body);
 assert.deepEqual(payload.to,["approved@example.invalid"]);
 assert.equal(payload.from,env.STAFF_EMAIL_FROM);
});
test("provider rejection never falls back to unauthenticated delivery",async()=>{
 const mail=adapter({
  STAFF_EMAIL_REQUIRE_ALLOWLIST:"true",
  STAFF_EMAIL_ALLOWLIST:"approved@example.invalid",
  RESEND_API_KEY:"synthetic-key",
  STAFF_EMAIL_FROM:"info@sohojac.com",
 },async()=>new Response(null,{status:403}));
 await assert.rejects(()=>mail.sendStaffEmail(input),/provider rejected/);
});
test("configured state and request UI do not claim an email was delivered",()=>{
 const workflow=readFileSync(".github/workflows/erp-ci.yml","utf8");
 const config=readFileSync("cloudflare.config.ts","utf8");
 const staff=readFileSync("app/dashboard/staff/page.tsx","utf8");
 const request=readFileSync("modules/platform/access/request-register.tsx","utf8");
 const publicForm=readFileSync("components/staff/access-request-form.tsx","utf8");
 const publicAPI=readFileSync("app/api/staff/access-request/route.ts","utf8");
 const css=readFileSync("app/globals.css","utf8");
 const guide=readFileSync("app/dashboard/help/staff-access/page.tsx","utf8");
 for(const key of ["DEV_RESEND_API_KEY","DEV_STAFF_EMAIL_FROM","DEV_STAFF_EMAIL_ALLOWLIST"]){
  assert(workflow.includes(key),"Missing dev email workflow setting "+key);
 }
 assert.match(config,/RESEND_API_KEY: bindings\.secret\(\)/);
 assert.match(config,/STAFF_EMAIL_REQUIRE_ALLOWLIST/);
 assert.doesNotMatch(workflow,/STAFF_EMAIL_FROM: ""/);
 assert.match(staff,/getStaffMailConfiguration/);
 assert.match(staff,/delivery not yet tested/);
 assert.match(request,/!emailReady/);
 assert.match(request,/role === "ACCOUNTANT"/);
 assert.match(publicForm,/Request received/);
 assert.match(publicForm,/text-emerald-200/);
 assert.match(publicForm,/text-slate-100/);
 assert.doesNotMatch(publicForm,/bg-green-50 p-5 text-sm leading-7 text-green-900/);
 assert.match(css,/\[class~="text-green-900"\]/);
 assert.match(publicForm,/option value="ACCOUNTANT" disabled/);
 assert.doesNotMatch(publicAPI,/requestedRole: z\.enum\(\["ADMIN", "OPERATOR", "TEACHER", "ACCOUNTANT"\]/);
 assert.match(guide,/id="email-delivery"/);
});
