import { env } from "cloudflare:workers";
import type { StudentCommand } from "./schema";

export type StudentCommandResult = {
  ok: boolean;
  message: string;
  admissionId?: string;
};
type StoredResult = { id: string; message: string };
type StudentRow = {
  id: string; student_no: string; full_name: string; class_grade: number | null;
  guardian_name: string; guardian_mobile: string; school_name: string | null;
  status: string; merged_into_id: string | null; version: number;
};
type BatchRow = {
  id: string; offering_id: string; capacity: number; year_key: string;
};
type AdmissionRow = {
  id: string; student_id: string | null; batch_id: string | null;
  offering_id: string; status: string; version: number;
};
type EnrollmentRow = {
  id: string; student_id: string; batch_id: string; admission_id: string;
  status: string; enrolled_at: string; ended_on: string | null; version: number;
};

export const studentBusinessDate = () => new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Dhaka",
});
const yearKey = (batch: string, offering: string) =>
  `COALESCE(${batch}.year_id,${offering}.academic_year_id,'name:'||${offering}.academic_year_name)`;
const openAdmission = "NOT IN ('CANCELLED','REJECTED')";

async function student(id: string) {
  return env.DB.prepare("SELECT * FROM academy_students WHERE id=?")
    .bind(id).first<StudentRow>();
}
async function activeBatch(id: string) {
  return env.DB.prepare([
    "SELECT b.id,b.offering_id,b.capacity,", yearKey("b", "o"), "AS year_key",
    "FROM academy_batches b JOIN public_programme_offerings o ON o.id=b.offering_id",
    "WHERE b.id=? AND b.status='ACTIVE' AND o.is_active=1",
    "AND (o.offering_status IS NULL OR o.offering_status='ACTIVE')",
  ].join(" ")).bind(id).first<BatchRow>();
}
async function replay(input: StudentCommand, actorId: string) {
  const key = await env.DB.prepare(
    "SELECT actor_id,payload_json,result_json FROM academy_student_command_keys WHERE request_id=?",
  ).bind(input.request_id).first<{ actor_id: string; payload_json: string; result_json: string }>();
  if (!key) return null;
  if (key.actor_id !== actorId || key.payload_json !== JSON.stringify(input)) {
    throw new Error("Request identity already used for another command.");
  }
  return JSON.parse(key.result_json) as StoredResult;
}
function result(input: StudentCommand, value: StoredResult): StudentCommandResult {
  return {
    ok: true,
    message: value.message,
    ...(input.action === "CREATE_EXISTING" ? { admissionId: value.id } : {}),
  };
}

/**
 * Port of the pinned student_command RPC. The server action validates the
 * source schema, origin and named permissions before entering this store.
 * A fresh result-id guard, request receipt and audit commit in the same D1
 * batch; failed guards abort every preceding write rather than reporting a
 * partially completed lifecycle change.
 */
export async function executeStudentCommand(
  input: StudentCommand,
  actorId: string,
): Promise<StudentCommandResult> {
  try {
    const prior = await replay(input, actorId);
    if (prior) return result(input, prior);
    const source = await student(input.student_id!);
    if (!source || source.merged_into_id || source.status === "ARCHIVED") {
      return { ok: false, message: "Use an existing canonical student." };
    }
    const today = studentBusinessDate();
    let response: StoredResult;
    let writes: D1PreparedStatement[];

    if (input.action === "CREATE_EXISTING") {
      const batch = await activeBatch(input.batch_id!);
      if (!batch) return { ok: false, message: "Select an active offering-linked batch." };
      const fee = await env.DB.prepare([
        "SELECT id FROM academy_fee_plans WHERE offering_id=? AND active=1",
        "AND (source_status IS NULL OR source_status='ACTIVE')",
        "AND (effective_from IS NULL OR effective_from<=?)",
        "AND (effective_to IS NULL OR effective_to>=?)",
        "ORDER BY source_version DESC,rowid DESC LIMIT 1",
      ].join(" ")).bind(batch.offering_id, today, today).first<{ id: string }>();
      if (!fee) return { ok: false, message: "An effective Fee Plan is required." };
      if (!source.guardian_name.trim() || !source.guardian_mobile.trim()) {
        return { ok: false, message: "A verified primary guardian is required." };
      }
      const id = crypto.randomUUID();
      const applicationNo = "SA-APP-" + crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
      response = {
        id,
        message: "Enrollment draft created using the existing Student ID. Review and accept it in Admissions.",
      };
      writes = [env.DB.prepare([
        "INSERT INTO academy_admissions(id,application_no,offering_id,student_id,existing_student,",
        "status,prepared_by,student_full_name,class_grade,guardian_full_name,guardian_mobile,",
        "school_name,batch_id,fee_plan_id)",
        "SELECT ?,?,b.offering_id,s.id,1,'DRAFT',?,s.full_name,s.class_grade,",
        "s.guardian_name,s.guardian_mobile,s.school_name,b.id,f.id",
        "FROM academy_students s JOIN academy_batches b ON b.id=?",
        "JOIN public_programme_offerings o ON o.id=b.offering_id",
        "JOIN academy_fee_plans f ON f.id=? AND f.offering_id=o.id AND f.active=1",
        "WHERE s.id=? AND s.version=? AND s.merged_into_id IS NULL AND s.status<>'ARCHIVED'",
        "AND b.status='ACTIVE' AND o.is_active=1",
        "AND (o.offering_status IS NULL OR o.offering_status='ACTIVE')",
        "AND (f.source_status IS NULL OR f.source_status='ACTIVE')",
        "AND (f.effective_from IS NULL OR f.effective_from<=?)",
        "AND (f.effective_to IS NULL OR f.effective_to>=?)",
        "AND length(trim(s.guardian_name))>0 AND length(trim(s.guardian_mobile))>0",
        "AND b.capacity>(SELECT COUNT(*) FROM academy_enrollments e WHERE e.batch_id=b.id AND e.status='ACTIVE')",
        "AND NOT EXISTS(SELECT 1 FROM academy_enrollments e JOIN academy_batches eb ON eb.id=e.batch_id",
        "JOIN public_programme_offerings eo ON eo.id=eb.offering_id WHERE e.student_id=s.id AND e.status='ACTIVE'",
        "AND", yearKey("eb", "eo"), "=", yearKey("b", "o"), ")",
        "AND NOT EXISTS(SELECT 1 FROM academy_admissions a JOIN academy_batches ab ON ab.id=a.batch_id",
        "JOIN public_programme_offerings ao ON ao.id=ab.offering_id WHERE a.student_id=s.id AND a.status", openAdmission,
        "AND", yearKey("ab", "ao"), "=", yearKey("b", "o"), ")",
      ].join(" ")).bind(id, applicationNo, actorId, batch.id, fee.id, source.id, source.version, today, today)];
      writes.push(env.DB.prepare([
        "INSERT INTO academy_student_command_keys(request_id,actor_id,payload_json,result_id,result_json)",
        "VALUES(?,?,?,(SELECT id FROM academy_admissions WHERE id=? AND student_id=? AND existing_student=1),?)",
      ].join(" ")).bind(input.request_id, actorId, JSON.stringify(input), id, source.id, JSON.stringify(response)));
    } else if (input.action === "TRANSFER") {
      const admission = await env.DB.prepare("SELECT * FROM academy_admissions WHERE id=? AND student_id=?")
        .bind(input.admission_id!, source.id).first<AdmissionRow>();
      if (!admission || admission.status !== "ENROLLED") {
        return { ok: false, message: "Only an active enrollment belonging to this student can transfer." };
      }
      const enrollment = await env.DB.prepare(
        "SELECT * FROM academy_enrollments WHERE admission_id=? AND student_id=? AND status='ACTIVE'",
      ).bind(admission.id, source.id).first<EnrollmentRow>();
      const destination = await activeBatch(input.batch_id!);
      if (!enrollment || enrollment.batch_id !== admission.batch_id || !destination ||
        destination.id === enrollment.batch_id || destination.offering_id !== admission.offering_id) {
        return { ok: false, message: "Select a different active batch in the same offering. Fee terms remain unchanged." };
      }
      const enrollmentId = crypto.randomUUID();
      const transferId = crypto.randomUUID();
      response = { id: admission.id, message: "Batch transfer completed; financial history preserved." };
      writes = [
        env.DB.prepare([
          "UPDATE academy_enrollments SET status='WITHDRAWN',ended_on=?,version=version+1",
          "WHERE id=? AND student_id=? AND status='ACTIVE' AND version=?",
          "AND EXISTS(SELECT 1 FROM academy_admissions a WHERE a.id=academy_enrollments.admission_id",
          "AND a.id=? AND a.version=? AND a.status='ENROLLED' AND a.batch_id=academy_enrollments.batch_id)",
          "AND EXISTS(SELECT 1 FROM academy_students s WHERE s.id=? AND s.version=?",
          "AND s.merged_into_id IS NULL AND s.status<>'ARCHIVED')",
        ].join(" ")).bind(today, enrollment.id, source.id, enrollment.version, admission.id, admission.version, source.id, source.version),
        env.DB.prepare([
          "INSERT INTO academy_enrollments(id,student_id,batch_id,admission_id,status)",
          "SELECT ?,e.student_id,b.id,e.admission_id,'ACTIVE' FROM academy_enrollments e",
          "JOIN academy_admissions a ON a.id=e.admission_id",
          "JOIN academy_batches b ON b.id=? AND b.offering_id=a.offering_id",
          "JOIN public_programme_offerings o ON o.id=b.offering_id",
          "WHERE e.id=? AND e.version=? AND e.status='WITHDRAWN' AND e.ended_on=?",
          "AND a.version=? AND a.status='ENROLLED' AND b.status='ACTIVE' AND o.is_active=1",
          "AND (o.offering_status IS NULL OR o.offering_status='ACTIVE')",
          "AND b.capacity>(SELECT COUNT(*) FROM academy_enrollments en WHERE en.batch_id=b.id AND en.status='ACTIVE')",
        ].join(" ")).bind(enrollmentId, destination.id, enrollment.id, enrollment.version + 1, today, admission.version),
        env.DB.prepare([
          "UPDATE academy_admissions SET batch_id=?,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
          "WHERE id=? AND version=? AND student_id=? AND status='ENROLLED'",
          "AND EXISTS(SELECT 1 FROM academy_enrollments e WHERE e.id=? AND e.admission_id=academy_admissions.id)",
        ].join(" ")).bind(destination.id, admission.id, admission.version, source.id, enrollmentId),
        env.DB.prepare([
          "INSERT INTO academy_enrollment_transfers(id,student_id,admission_id,from_enrollment_id,",
          "to_enrollment_id,from_batch_id,to_batch_id,authorized_by,authorization_reason,transferred_on)",
          "SELECT ?,?,?,?,?,?,?,?,?,? FROM academy_admissions a",
          "WHERE a.id=? AND a.version=? AND a.batch_id=?",
          "AND EXISTS(SELECT 1 FROM academy_enrollments WHERE id=? AND status='ACTIVE')",
        ].join(" ")).bind(transferId, source.id, admission.id, enrollment.id, enrollmentId,
          enrollment.batch_id, destination.id, actorId, input.reason, today,
          admission.id, admission.version + 1, destination.id, enrollmentId),
        env.DB.prepare([
          "INSERT INTO academy_student_command_keys(request_id,actor_id,payload_json,result_id,result_json)",
          "VALUES(?,?,?,(SELECT admission_id FROM academy_enrollment_transfers WHERE id=?),?)",
        ].join(" ")).bind(input.request_id, actorId, JSON.stringify(input), transferId, JSON.stringify(response)),
      ];
    } else {
      const target = await student(input.target_id!);
      if (!target || target.id === source.id || target.merged_into_id || target.status === "ARCHIVED" || !input.confirmed_same_person) {
        return { ok: false, message: "Select a different canonical student and confirm verified identity evidence." };
      }
      const mergeId = crypto.randomUUID();
      response = { id: target.id, message: "Duplicate archived; original records and financial history preserved." };
      writes = [
        env.DB.prepare([
          "INSERT INTO academy_student_merges(id,source_id,target_id,authorized_by,authorization_reason,source_snapshot,target_snapshot)",
          "SELECT ?,s.id,t.id,?,?,?,? FROM academy_students s CROSS JOIN academy_students t",
          "WHERE s.id=? AND t.id=? AND s.version=? AND t.version=? AND s.id<>t.id",
          "AND s.merged_into_id IS NULL AND t.merged_into_id IS NULL AND s.status<>'ARCHIVED' AND t.status<>'ARCHIVED'",
          "AND NOT EXISTS(SELECT 1 FROM academy_students child WHERE child.merged_into_id=s.id)",
          "AND NOT EXISTS(SELECT 1 FROM academy_enrollments e WHERE e.student_id=s.id AND e.status='ACTIVE')",
          "AND NOT EXISTS(SELECT 1 FROM academy_admissions a WHERE a.student_id=s.id AND a.status", openAdmission, ")",
          "AND (lower(trim(s.full_name))=lower(trim(t.full_name)) OR",
          "(length(trim(s.guardian_mobile))>0 AND s.guardian_mobile=t.guardian_mobile))",
        ].join(" ")).bind(mergeId, actorId, input.reason, JSON.stringify(source), JSON.stringify(target),
          source.id, target.id, source.version, target.version),
        env.DB.prepare([
          "UPDATE academy_students SET merged_into_id=?,status='ARCHIVED',version=version+1",
          "WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM academy_student_merges WHERE id=? AND source_id=academy_students.id)",
        ].join(" ")).bind(target.id, source.id, source.version, mergeId),
        env.DB.prepare([
          "INSERT INTO academy_student_command_keys(request_id,actor_id,payload_json,result_id,result_json)",
          "VALUES(?,?,?,(SELECT m.target_id FROM academy_student_merges m JOIN academy_students s ON s.id=m.source_id",
          "WHERE m.id=? AND s.merged_into_id=m.target_id AND s.status='ARCHIVED' AND s.version=?),?)",
        ].join(" ")).bind(input.request_id, actorId, JSON.stringify(input), mergeId, source.version + 1, JSON.stringify(response)),
      ];
    }

    writes.push(env.DB.prepare([
      "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json)",
      "VALUES(?,'student',?,?,?,?,?,(SELECT result_json FROM academy_student_command_keys WHERE request_id=? AND actor_id=?))",
    ].join(" ")).bind(crypto.randomUUID(), source.id, input.action, actorId, input.reason,
      JSON.stringify(source), input.request_id, actorId));
    await env.DB.batch(writes);
    return result(input, response);
  } catch {
    try {
      const previous = await replay(input, actorId);
      if (previous) return result(input, previous);
    } catch {
      return { ok: false, message: "Request identity already used. Refresh and verify the result before retrying." };
    }
    return { ok: false, message: "Student command did not post. Check current identity, enrollment, fee terms and capacity before retrying the same request." };
  }
}

export async function executeEnrollmentClosure(
  input: { student_id: string; enrollment_id: string; mode: "WITHDRAWN" | "COMPLETED"; reason: string },
  actorId: string,
): Promise<StudentCommandResult> {
  const before = await env.DB.prepare("SELECT * FROM academy_enrollments WHERE id=? AND student_id=?")
    .bind(input.enrollment_id, input.student_id).first<EnrollmentRow>();
  if (!before) return { ok: false, message: "Enrollment not found for this student." };
  if (before.status !== "ACTIVE") return { ok: true, message: "Enrollment is already closed." };
  const today = studentBusinessDate();
  if (before.enrolled_at.slice(0, 10) > today) {
    return { ok: false, message: "Enrollment start is in the future. Cancel the admission instead." };
  }
  const closureId = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare([
        "INSERT INTO academy_student_enrollment_closures(id,enrollment_id,student_id,mode,closed_on,actor_id,reason,before_json)",
        "SELECT ?,e.id,e.student_id,?,?,?,?,? FROM academy_enrollments e",
        "WHERE e.id=? AND e.student_id=? AND e.status='ACTIVE' AND e.version=?",
      ].join(" ")).bind(closureId, input.mode, today, actorId, input.reason, JSON.stringify(before), before.id, input.student_id, before.version),
      env.DB.prepare([
        "UPDATE academy_enrollments SET status=?,ended_on=?,version=version+1 WHERE id=? AND student_id=?",
        "AND status='ACTIVE' AND version=? AND EXISTS(SELECT 1 FROM academy_student_enrollment_closures WHERE id=?)",
      ].join(" ")).bind(input.mode, today, before.id, input.student_id, before.version, closureId),
      env.DB.prepare([
        "UPDATE academy_admissions SET status='CLOSED_ENROLLMENT',version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        "WHERE id=? AND student_id=? AND status='ENROLLED'",
        "AND EXISTS(SELECT 1 FROM academy_enrollments e WHERE e.id=? AND e.version=? AND e.status=?)",
        "AND NOT EXISTS(SELECT 1 FROM academy_enrollments e WHERE e.admission_id=academy_admissions.id AND e.status='ACTIVE')",
      ].join(" ")).bind(before.admission_id, input.student_id, before.id, before.version + 1, input.mode),
      env.DB.prepare([
        "UPDATE academy_students SET status='INACTIVE',version=version+1 WHERE id=? AND status<>'ARCHIVED'",
        "AND EXISTS(SELECT 1 FROM academy_student_enrollment_closures WHERE id=?)",
        "AND NOT EXISTS(SELECT 1 FROM academy_enrollments e WHERE e.student_id=academy_students.id AND e.status='ACTIVE')",
      ].join(" ")).bind(input.student_id, closureId),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json)",
        "VALUES(?,'enrollment',(SELECT c.enrollment_id FROM academy_student_enrollment_closures c",
        "JOIN academy_enrollments e ON e.id=c.enrollment_id WHERE c.id=? AND e.version=? AND e.status=?),?,?,?,?,?)",
      ].join(" ")).bind(crypto.randomUUID(), closureId, before.version + 1, input.mode, input.mode, actorId,
        input.reason, JSON.stringify(before), JSON.stringify({ status: input.mode, ended_on: today, student_id: input.student_id })),
    ]);
    return { ok: true, message: "Enrollment closed. Future recurring billing stops; existing invoices, payments and due balances remain." };
  } catch {
    const current = await env.DB.prepare("SELECT status FROM academy_enrollments WHERE id=? AND student_id=?")
      .bind(before.id, input.student_id).first<{ status: string }>();
    if (current && current.status !== "ACTIVE") return { ok: true, message: "Enrollment is already closed." };
    return { ok: false, message: "Could not close enrollment. Review its current status before retrying." };
  }
}

export async function executeStudentState(
  input: { id: string; active: boolean; reason: string },
  actorId: string,
): Promise<StudentCommandResult> {
  const before = await student(input.id);
  if (!before || before.merged_into_id || before.status === "ARCHIVED") {
    return { ok: false, message: "Use the canonical Student ID. Verified duplicates remain archived." };
  }
  const target = input.active ? "ACTIVE" : "INACTIVE";
  try {
    const writes = await env.DB.batch([
      env.DB.prepare([
        "UPDATE academy_students SET status=?,version=version+1 WHERE id=? AND version=?",
        "AND merged_into_id IS NULL AND status<>'ARCHIVED' AND",
        input.active ? "EXISTS" : "NOT EXISTS",
        "(SELECT 1 FROM academy_enrollments e WHERE e.student_id=academy_students.id AND e.status='ACTIVE')",
      ].join(" ")).bind(target, input.id, before.version),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json)",
        "SELECT ?,'student',?,?,?,?,?,? WHERE changes()=1",
      ].join(" ")).bind(crypto.randomUUID(), input.id, input.active ? "REACTIVATE" : "MARK_INACTIVE", actorId,
        input.reason, JSON.stringify(before), JSON.stringify({ status: target })),
    ]);
    if (writes[0].meta.changes !== 1 || writes[1].meta.changes !== 1) {
      return { ok: false, message: input.active ? "Activate an enrollment before activating this student." : "Withdraw or close the active enrollment first; history and balances remain intact." };
    }
    return { ok: true, message: input.active ? "Student record reactivated." : "Student marked inactive. History retained." };
  } catch {
    return { ok: false, message: "Student state changed. Refresh and verify the enrollment before retrying." };
  }
}
