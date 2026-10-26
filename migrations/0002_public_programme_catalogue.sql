-- Initial public showcase based on Sohoj Academy's 2026 published programme names.
-- No admission intake is advertised: both records start CLOSED, zero seats confirmed.
-- A staff member must explicitly update application state before accepting applications.
INSERT OR IGNORE INTO public_programme_offerings (
 id, code, name, class_name, academic_year_name, branch_name,
 showcase_eyebrow, showcase_eyebrow_bn, showcase_title, showcase_title_bn,
 showcase_description, showcase_description_bn, showcase_icon, subjects_json,
 show_on_website, is_active, is_accepting_applications, application_state,
 showcase_sort_order
) VALUES (
 'sa-annual-2026', 'ANNUAL_2026', 'Annual Exam Readiness 2026', 'Classes 8–9', '2026', 'Sohoj Academy',
 'ACADEMIC PREPARATION', 'একাডেমিক প্রস্তুতি',
 'Annual Exam Readiness 2026', 'বার্ষিক পরীক্ষা প্রস্তুতি ২০২৬',
 'Focused revision, practice and regular progress review for students preparing for their annual examinations.',
 'বার্ষিক পরীক্ষার প্রস্তুতিতে মনোযোগী পুনরাবৃত্তি, অনুশীলন ও নিয়মিত অগ্রগতি পর্যালোচনা।',
 'clipboard-check', '[]', 1, 1, 0, 'CLOSED', 10
);
INSERT OR IGNORE INTO public_programme_offerings (
 id, code, name, class_name, academic_year_name, branch_name,
 showcase_eyebrow, showcase_eyebrow_bn, showcase_title, showcase_title_bn,
 showcase_description, showcase_description_bn, showcase_icon, subjects_json,
 show_on_website, is_active, is_accepting_applications, application_state,
 showcase_sort_order
) VALUES (
 'sa-ssc-science', 'SSC_SCIENCE', 'SSC A+ Preparation — Science', 'Class 10 · Science', '2026', 'Sohoj Academy',
 'SSC PREPARATION', 'এসএসসি প্রস্তুতি',
 'SSC A+ Preparation', 'এসএসসি এ+ প্রস্তুতি',
 'Science-focused practice and assessment, with clear feedback on learning gaps and progress.',
 'বিজ্ঞানভিত্তিক অনুশীলন ও মূল্যায়ন, শেখার ঘাটতি এবং অগ্রগতি নিয়ে স্পষ্ট মতামত।',
 'graduation-cap', '[{"id":"physics","code":"PHY","name":"Physics"},{"id":"chemistry","code":"CHEM","name":"Chemistry"},{"id":"biology","code":"BIO","name":"Biology"},{"id":"higher-maths","code":"HMATH","name":"Higher Mathematics"}]',
 1, 1, 0, 'CLOSED', 20
);
