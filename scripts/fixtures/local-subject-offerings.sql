-- Disposable test-only offerings, with ONE global Subject entity for any programme.
INSERT INTO public_programme_offerings(id,code,name,class_name,academic_year_name,is_active,offering_status,show_on_website,is_accepting_applications,application_state)
VALUES ('sa-ssc-science','SSC-SCIENCE-2026','SSC A+ Preparation','Class 10','2026',1,'ACTIVE',1,1,'OPEN'),
       ('sa-annual-2026','ANNUAL-2026','Annual Exam Readiness 2026','Class 8','2026',1,'ACTIVE',1,1,'OPEN');
-- Stable sample references use the SAME identities as the development reference seed.
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES
 ('61f850dd-0509-5a25-92de-9c0847785dea','SUB07','Physics'),('2dcee48c-5131-5d5f-b660-87efaa43baec','SUB08','Chemistry'),
 ('9207a96a-4e04-5e9d-8379-77ae9cbc9daf','SUB09','Biology'),('e617b0ce-2ddb-5109-8661-a5714ba85a0f','SUB10','Higher Mathematics');
INSERT INTO academy_offering_subjects(offering_id,subject_id,sort_order) VALUES
 ('sa-ssc-science','61f850dd-0509-5a25-92de-9c0847785dea',1),('sa-ssc-science','2dcee48c-5131-5d5f-b660-87efaa43baec',2),
 ('sa-ssc-science','9207a96a-4e04-5e9d-8379-77ae9cbc9daf',3),('sa-ssc-science','e617b0ce-2ddb-5109-8661-a5714ba85a0f',4);
