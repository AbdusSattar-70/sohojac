-- Disposable local/CI-only synthetic catalogue; NEVER run against dev or production D1.
INSERT INTO public_programme_offerings(id,code,name,class_name,academic_year_name,is_active,offering_status,show_on_website,is_accepting_applications,application_state)
VALUES ('sa-ssc-science','SSC-SCIENCE-2026','SSC A+ Preparation','Class 10','2026',1,'ACTIVE',1,1,'OPEN'),
       ('sa-annual-2026','ANNUAL-2026','Annual Exam Readiness 2026','Class 8','2026',1,'ACTIVE',1,1,'OPEN');
INSERT INTO academy_subjects(id,code,name,class_grade,group_name)
VALUES ('physics','PHY','Physics',10,'SCIENCE'),('chemistry','CHEM','Chemistry',10,'SCIENCE'),
       ('biology','BIO','Biology',10,'SCIENCE'),('higher-maths','HMATH','Higher Mathematics',10,'SCIENCE');
INSERT INTO academy_offering_subjects(offering_id,subject_id,sort_order)
VALUES ('sa-ssc-science','physics',1),('sa-ssc-science','chemistry',2),
       ('sa-ssc-science','biology',3),('sa-ssc-science','higher-maths',4);
