-- USER-AUTHORIZED DEVELOPMENT DATA ONLY. Both deployments share sohojac D1.
-- Idempotent and additive: preserve accounts, existing records and financial ledgers.
-- Abort before writes if no active owner exists; never invent auth credentials.
SELECT CASE WHEN EXISTS(SELECT 1 FROM staff_memberships WHERE role='OWNER' AND active=1)
 THEN 1 ELSE json('An existing active OWNER is required before development seeding') END;

INSERT OR IGNORE INTO academy_branches(id,code,name) VALUES
 ('f1000000-0000-4000-8000-000000000010','TEST-CAMPUS','TEST — Development Campus');
INSERT OR IGNORE INTO academic_years(id,code,title,starts_on,ends_on,status) VALUES
 ('f1000000-0000-4000-8000-000000000011','TEST-2027','TEST — Academic Year 2027','2027-01-01','2027-12-31','ACTIVE');
INSERT OR IGNORE INTO academy_classes(id,code,name,sort_order) VALUES
 ('f1000000-0000-4000-8000-000000000012','TEST-CLASS8','TEST — Class 8',108);
INSERT OR IGNORE INTO academy_programmes(id,code,name,description) VALUES
 ('f1000000-0000-4000-8000-000000000013','TEST-READINESS','TEST — Exam Readiness','Synthetic development programme; not a real advertised offering.');
-- Both old subject masters remain separate until Phase 3; this explicit test-only
-- crosswalk lets existing forms be exercised without pretending to reconcile real history.
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES
 ('f1000000-0000-4000-8000-000000000014','TEST-MATH','TEST — Mathematics');
INSERT OR IGNORE INTO academy_subjects(id,code,name,class_grade,group_name) VALUES
 ('f1000000-0000-4000-8000-000000000014','TEST-MATH','TEST — Mathematics',8,'GENERAL');
INSERT OR IGNORE INTO academy_schools(id,name,is_verified) VALUES
 ('f1000000-0000-4000-8000-000000000015','TEST — Synthetic School',1);
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES
 ('f1000000-0000-4000-8000-000000000016','TEST-GUARDIAN','TEST — Guardian');
INSERT OR IGNORE INTO public_programme_offerings
 (id,code,name,class_name,academic_year_name,branch_name,show_on_website,is_active,is_accepting_applications,
 application_state,offering_status,branch_id,academic_year_id,class_id,program_id,operation_kind)
 VALUES ('test-readiness-2027','TEST-READINESS-2027','TEST — Exam Readiness 2027','Class 8','TEST — Academic Year 2027',
 'TEST — Development Campus',0,1,0,'CLOSED','ACTIVE','f1000000-0000-4000-8000-000000000010',
 'f1000000-0000-4000-8000-000000000011','f1000000-0000-4000-8000-000000000012','f1000000-0000-4000-8000-000000000013','COACHING');
INSERT INTO academy_offering_subjects(offering_id,subject_id,sort_order)
 SELECT 'test-readiness-2027','f1000000-0000-4000-8000-000000000014',0
 WHERE NOT EXISTS(SELECT 1 FROM academy_offering_subjects WHERE offering_id='test-readiness-2027' AND subject_id='f1000000-0000-4000-8000-000000000014');
INSERT OR IGNORE INTO academy_fee_plans
 (id,offering_id,title,monthly_amount_paisa,admission_amount_paisa,active,source_version,source_status,billing_cycle,due_day,
 currency_code,effective_from,change_reason,created_by,created_at)
 SELECT 'f1000000-0000-4000-8000-000000000017','test-readiness-2027','TEST — Standard fee v1',250000,50000,0,1,'DRAFT',
 'MONTHLY',10,'BDT',date('now','+6 hours'),'User-authorized synthetic development seed',user_id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
 FROM staff_memberships WHERE role='OWNER' AND active=1 ORDER BY user_id LIMIT 1;
INSERT INTO academy_fee_plan_components(id,plan_id,code,name,amount_paisa,charge_type,recurrence,sort_order)
 SELECT 'f1000000-0000-4000-8000-000000000018','f1000000-0000-4000-8000-000000000017','TUITION','TEST — Monthly tuition',250000,'TUITION','PER_CYCLE',0
 WHERE NOT EXISTS(SELECT 1 FROM academy_fee_plan_components WHERE id='f1000000-0000-4000-8000-000000000018');
INSERT INTO academy_fee_plan_components(id,plan_id,code,name,amount_paisa,charge_type,recurrence,sort_order)
 SELECT 'f1000000-0000-4000-8000-000000000019','f1000000-0000-4000-8000-000000000017','ADMISSION','TEST — Admission fee',50000,'ADMISSION','ONE_TIME',1
 WHERE NOT EXISTS(SELECT 1 FROM academy_fee_plan_components WHERE id='f1000000-0000-4000-8000-000000000019');
UPDATE academy_fee_plans SET active=1,source_status='ACTIVE'
 WHERE id='f1000000-0000-4000-8000-000000000017' AND source_status='DRAFT';
INSERT OR IGNORE INTO academy_batches(id,code,name,offering_id,year_id,capacity,status) VALUES
 ('f1000000-0000-4000-8000-000000000020','TEST-A','TEST — Batch A','test-readiness-2027','f1000000-0000-4000-8000-000000000011',12,'ACTIVE');
INSERT OR IGNORE INTO academy_students(id,student_no,full_name,class_grade,guardian_name,guardian_mobile,school_name,status) VALUES
 ('f1000000-0000-4000-8000-000000000021','TEST-SA-000001','TEST — Returning Student',8,'TEST — Guardian','01700000000','TEST — Synthetic School','INACTIVE');
INSERT OR IGNORE INTO academy_admissions
 (id,application_no,offering_id,student_id,existing_student,status,prepared_by,student_full_name,class_grade,guardian_full_name,
 guardian_mobile,school_name,batch_id,fee_plan_id)
 SELECT 'f1000000-0000-4000-8000-000000000022','TEST-APP-NEW','test-readiness-2027',NULL,0,'DRAFT',user_id,
 'TEST — New Applicant',8,'TEST — Guardian','01700000000','TEST — Synthetic School','f1000000-0000-4000-8000-000000000020','f1000000-0000-4000-8000-000000000017'
 FROM staff_memberships WHERE role='OWNER' AND active=1 ORDER BY user_id LIMIT 1;
INSERT OR IGNORE INTO academy_admissions
 (id,application_no,offering_id,student_id,existing_student,status,prepared_by,student_full_name,class_grade,guardian_full_name,
 guardian_mobile,school_name,batch_id,fee_plan_id)
 SELECT 'f1000000-0000-4000-8000-000000000023','TEST-APP-RETURN','test-readiness-2027','f1000000-0000-4000-8000-000000000021',1,'DRAFT',user_id,
 'TEST — Returning Student',8,'TEST — Guardian','01700000000','TEST — Synthetic School','f1000000-0000-4000-8000-000000000020','f1000000-0000-4000-8000-000000000017'
 FROM staff_memberships WHERE role='OWNER' AND active=1 ORDER BY user_id LIMIT 1;
INSERT OR IGNORE INTO academy_admission_intake_details(admission_id,request_id,guardian_address,guardian_relationship,recorded_by)
 SELECT a.id,'seed:'||a.id,'TEST — Synthetic address for development','TEST — Guardian',a.prepared_by
 FROM academy_admissions a WHERE a.id IN ('f1000000-0000-4000-8000-000000000022','f1000000-0000-4000-8000-000000000023');
INSERT OR IGNORE INTO public_enquiries(id,reference,intent,offering_id,student_name,class_name,guardian_name,mobile,consent_at,notes)
 VALUES ('f1000000-0000-4000-8000-000000000024','TEST-CRM-INTEREST','interest','test-readiness-2027','TEST — CRM Prospect','Class 8',
 'TEST — Guardian','01700000000',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Synthetic user-authorized test data; not a real contact or consent.');
INSERT OR IGNORE INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)
 SELECT 'f1000000-0000-4000-8000-000000000100','development_seed','test-readiness-2027','SEEDED',user_id,
 'User explicitly requested one development DB and repeatable seed data','{"synthetic":true,"financialPostings":false,"publicOfferingVisible":false}'
 FROM staff_memberships WHERE role='OWNER' AND active=1 ORDER BY user_id LIMIT 1;
