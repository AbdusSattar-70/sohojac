import { verifyTurnstile } from "@/lib/security/request-protection";
import { env } from "cloudflare:workers";
import { z } from "zod";

export const dynamic = "force-dynamic";

const phone = /^01[3-9][0-9]{8}$/;
const safeText = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => safeText(max).optional().default("");
const schema = z.object({
  intent: z.enum(["interest", "admission"]),
  offeringId: optionalText(100),
  studentName: safeText(120).min(2),
  studentNameBn: optionalText(120),
  studentMobile: optionalText(20).refine(value => !value || phone.test(value)),
  studentEmail: z.union([z.email().max(180), z.literal("")]).optional().default(""),
  className: safeText(40).min(1),
  schoolName: optionalText(160),
  guardianName: safeText(120).min(2),
  guardianRelationship: optionalText(40),
  mobile: z.string().trim().regex(phone, "Use an 11-digit Bangladesh mobile number"),
  alternateMobile: optionalText(20).refine(value => !value || phone.test(value)),
  area: optionalText(180),
  subjectNames: z.array(safeText(80)).max(20).default([]),
  preferredSchedule: z.enum(["", "MORNING", "AFTERNOON", "EVENING", "FLEXIBLE"]).default(""),
  preferredDays: z.array(z.enum(["SAT","SUN","MON","TUE","WED","THU","FRI"])).max(7).default([]),
  trialInterest: z.boolean().default(false),
  referralNote: optionalText(250),
  notes: optionalText(1000),
  consent: z.literal(true),
  website: optionalText(100), // Hidden honeypot input
  turnstileToken: optionalText(2048),
}).strict();

function answer(data: object, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return answer({ error: "Invalid request origin" }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return answer({ error: "JSON required" }, 415);
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 16000) return answer({ error: "Form too large" }, 413);
    payload = JSON.parse(body);
  } catch { return answer({ error: "Invalid JSON" }, 400); }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) return answer({ error: "Please check the highlighted form fields", fields: z.flattenError(parsed.error).fieldErrors }, 400);
  const d = parsed.data;
  if (d.website) return answer({ ok: true }); // Quietly discard bot submissions.

  const securityError = await verifyTurnstile(request, d.turnstileToken ?? "", "public-enquiry");
  if (securityError) return securityError;

  try {
    if (d.intent === "admission" && !d.offeringId) {
      return answer({ error: "Select a programme accepting applications" }, 400);
    }
    if (d.offeringId) {
      const offering = await env.DB.prepare(
        "SELECT id, is_accepting_applications, application_state FROM public_programme_offerings WHERE id = ? AND show_on_website = 1 AND is_active = 1"
      ).bind(d.offeringId).first<{id:string;is_accepting_applications:number;application_state:string}>();
      if (!offering) return answer({ error: "Selected programme is not available" }, 400);
      if (d.intent === "admission" && (!offering.is_accepting_applications || offering.application_state !== "OPEN")) {
        return answer({ error: "Applications are closed for this programme" }, 409);
      }
    }
    const duplicate = await env.DB.prepare(
      "SELECT reference FROM public_enquiries WHERE mobile = ? AND submitted_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute') LIMIT 1"
    ).bind(d.mobile).first<{reference:string}>();
    if (duplicate) return answer({ error: "A registration was just received for this number. Please try again shortly." }, 429);

    const id = crypto.randomUUID();
    const reference = "SA-ENQ-" + new Date().getUTCFullYear() + "-" + id.slice(0, 12).toUpperCase();
    await env.DB.prepare(
      `INSERT INTO public_enquiries (
      id,reference,intent,offering_id,student_name,student_name_bn,student_mobile,student_email,
      class_name,school_name,guardian_name,guardian_relationship,mobile,alternate_mobile,area,
      subjects_json,preferred_schedule,preferred_days_json,trial_interest,referral_note,notes,consent_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id, reference, d.intent, d.offeringId || null, d.studentName, d.studentNameBn || null,
      d.studentMobile || null, d.studentEmail || null, d.className, d.schoolName || null,
      d.guardianName, d.guardianRelationship || null, d.mobile, d.alternateMobile || null,
      d.area || null, JSON.stringify(d.subjectNames), d.preferredSchedule || null,
      JSON.stringify(d.preferredDays), d.trialInterest ? 1 : 0,
      d.referralNote || null, d.notes || null, new Date().toISOString()
    ).run();

    return answer({ ok: true, reference, studentName: d.studentName, guardianName: d.guardianName,
      mobile: d.mobile, intent: d.intent, submitted: new Date().toISOString() }, 201);
  } catch {
    return answer({ error: "The registration service is temporarily unavailable. Please try again." }, 503);
  }
}
