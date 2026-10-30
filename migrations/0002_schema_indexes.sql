-- Final explicit indexes / uniqueness from verified source schema.
CREATE INDEX idx_public_programmes_display
ON public_programme_offerings(show_on_website, is_active, showcase_sort_order);

CREATE INDEX idx_public_enquiries_recent ON public_enquiries(submitted_at DESC);

CREATE INDEX idx_public_enquiries_mobile_recent ON public_enquiries(mobile, submitted_at DESC);

CREATE INDEX idx_public_enquiries_offering ON public_enquiries(offering_id);

CREATE INDEX "idx_session_user" ON "session" ("userId");

CREATE INDEX "idx_account_user" ON "account" ("userId");

CREATE UNIQUE INDEX "idx_account_provider" ON "account" ("providerId", "accountId");

CREATE INDEX "idx_verification_identifier" ON "verification" ("identifier");

CREATE UNIQUE INDEX idx_only_one_owner
  ON staff_memberships (role) WHERE role = 'OWNER' AND active = 1;

CREATE INDEX idx_staff_prospect_events_enquiry
  ON staff_prospect_events (enquiry_id, occurred_at DESC);

CREATE INDEX idx_staff_access_requests_status ON staff_access_requests(status,created_at DESC);

CREATE UNIQUE INDEX idx_staff_access_requests_pending_email
  ON staff_access_requests(lower(email)) WHERE status IN ('PENDING','VERIFIED','INVITED');

CREATE INDEX idx_staff_invites_request ON staff_invitation_tokens(request_id,created_at DESC);

CREATE INDEX idx_erp_audit_entity ON erp_audit_events(entity_type,entity_id,occurred_at DESC);

CREATE INDEX idx_erp_audit_actor ON erp_audit_events(actor_id,occurred_at DESC);

CREATE INDEX idx_batches_offering ON academy_batches(offering_id,status);

CREATE INDEX idx_invoices_student ON finance_invoices(student_id,status);

CREATE INDEX idx_journal_lines_journal ON finance_journal_lines(journal_id);

CREATE UNIQUE INDEX idx_staff_invitation_claim_id
  ON staff_invitation_tokens(claim_id) WHERE claim_id IS NOT NULL;

CREATE INDEX idx_staff_invite_expiry
  ON staff_invitation_tokens(request_id, expires_at DESC, created_at DESC);

CREATE INDEX idx_batch_year_status ON academy_batches(year_id,status);

CREATE INDEX idx_fee_plan_offering ON academy_fee_plans(offering_id,active);

CREATE INDEX idx_admission_bills_issued ON academy_admission_bills(issue_on);

CREATE INDEX idx_attendance_class_date ON academy_attendance(class_on,state);

CREATE INDEX idx_operating_expenses_date ON finance_operating_expenses(spent_on DESC);

CREATE INDEX idx_academy_sessions_batch_day
ON academy_class_sessions(batch_id,class_on DESC);

CREATE INDEX idx_academy_assessments_batch ON academy_assessments(batch_id,held_on DESC);

CREATE INDEX idx_result_enrollment ON academy_assessment_results(enrollment_id);

CREATE INDEX idx_academy_subjects_grade ON academy_subjects(class_grade,group_name,active);

CREATE INDEX idx_teacher_active_batches
ON academy_batch_teachers(teacher_user_id,active,batch_id);

CREATE INDEX idx_erp_permission_grants_user ON erp_permission_grants(user_id);

CREATE INDEX idx_academic_year_status ON academic_years(status);

CREATE INDEX idx_academy_schools_name ON academy_schools(name);

CREATE INDEX idx_academy_staff_status ON academy_staff(status,staff_seq);

CREATE INDEX idx_academy_staff_name ON academy_staff(full_name);

CREATE INDEX idx_public_offering_academic_links
 ON public_programme_offerings(academic_year_id,class_id,program_id,group_id);

CREATE INDEX idx_public_offering_branch_kind
 ON public_programme_offerings(branch_id,operation_kind);

CREATE INDEX idx_academy_prospects_queue
 ON academy_prospects(status,next_follow_up_at);

CREATE INDEX idx_academy_prospects_staff
 ON academy_prospects(assigned_to_staff_id,status);

CREATE INDEX idx_prospect_followups_history
 ON academy_prospect_followups(prospect_id,occurred_at DESC,id DESC);

CREATE INDEX idx_academy_referrers_active ON academy_referrer_people(is_active,full_name);

CREATE INDEX idx_admission_extra_charges ON academy_admission_extra_charges(admission_id,is_active);

CREATE INDEX idx_students_canonical ON academy_students(merged_into_id);

CREATE UNIQUE INDEX idx_one_active_admission_enrollment ON academy_enrollments(admission_id) WHERE status='ACTIVE';

CREATE UNIQUE INDEX idx_one_active_student_batch ON academy_enrollments(student_id,batch_id) WHERE status='ACTIVE';

CREATE INDEX idx_enrollment_student_history ON academy_enrollments(student_id,enrolled_at DESC);

CREATE INDEX idx_enrollment_batch_status ON academy_enrollments(batch_id,status);

CREATE INDEX idx_admissions_status ON academy_admissions(status,created_at DESC);

CREATE INDEX idx_admissions_batch ON academy_admissions(batch_id,status);

CREATE INDEX idx_admissions_student ON academy_admissions(student_id,status);

CREATE UNIQUE INDEX idx_source_fee_plan_versions
 ON academy_fee_plans(offering_id,source_version) WHERE source_version IS NOT NULL;

CREATE UNIQUE INDEX one_open_collection_promise
 ON finance_collection_promises(invoice_id) WHERE status='OPEN';

CREATE INDEX idx_collection_events_invoice
 ON finance_collection_events(invoice_id,action,created_at DESC);

CREATE INDEX idx_security_limits_expiry ON security_request_limits(expires_at);
