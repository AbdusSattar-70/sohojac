-- Canonical fresh-development reference seed (no sample people or payments).
-- Subjects are one reusable master entity, independent of classes and groups.
-- Reentrant INSERT OR IGNORE statements preserve staff edits.
-- Editable reference data. No invented people, applications, prices or transactions.
INSERT OR IGNORE INTO academy_classes(id,code,name,sort_order) VALUES ('4d521c63-9dc5-5651-b2d3-9e787510040a','CLASS1','Class 1',1);
INSERT OR IGNORE INTO academy_classes(id,code,name,sort_order) VALUES ('9a859e31-9b3b-51df-8bce-5bfd8a6efce9','CLASS2','Class 2',2);
INSERT OR IGNORE INTO academy_classes(id,code,name,sort_order) VALUES ('6d5e06fb-9a55-546e-8ef3-120e20e54ffc','CLASS3','Class 3',3);
INSERT OR IGNORE INTO academy_classes(id,code,name,sort_order) VALUES ('d06c5cf2-83e4-57ce-8366-d6b283309e3b','CLASS4','Class 4',4);
INSERT OR IGNORE INTO academy_classes(id,code,name,sort_order) VALUES ('0f0adb0a-67f7-5396-80b0-f06ea468c172','CLASS5','Class 5',5);
INSERT OR IGNORE INTO academy_classes(id,code,name,sort_order) VALUES ('e633ebe6-538e-525d-b3aa-08f03694991a','CLASS6','Class 6',6);
INSERT OR IGNORE INTO academy_classes(id,code,name,sort_order) VALUES ('e80f82d7-7534-5f8d-9d23-0107c967f006','CLASS7','Class 7',7);
INSERT OR IGNORE INTO academy_classes(id,code,name,sort_order) VALUES ('648d0740-4b0a-5067-8a0d-e68fbfafcce7','CLASS8','Class 8',8);
INSERT OR IGNORE INTO academy_classes(id,code,name,sort_order) VALUES ('86ffee78-07fa-546f-bca6-89e74843f035','CLASS9','Class 9',9);
INSERT OR IGNORE INTO academy_classes(id,code,name,sort_order) VALUES ('158d8bdd-8935-54a0-8de8-e3f094d5197f','CLASS10','Class 10',10);
INSERT OR IGNORE INTO academy_classes(id,code,name,sort_order) VALUES ('f90dc0d1-9447-5353-802e-4f6ba44813f9','CLASS11','Class 11',11);
INSERT OR IGNORE INTO academy_classes(id,code,name,sort_order) VALUES ('ac50b352-ffb1-52f0-ba5f-4b6dba232121','CLASS12','Class 12',12);
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('6deeb963-343b-55c5-b485-07866873fd1d','FATHER','Father');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('7cbe3ae5-95a0-51ff-a8ff-6bf8fcf9c160','MOTHER','Mother');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('0148b7ba-46b4-54bc-8602-3042d677f3ac','STEPFATHER','Stepfather');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('ad292d26-256e-508f-9e70-668f001c895f','STEPMOTHER','Stepmother');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('dadc8cd1-e283-528d-83a0-1919426f75b1','BROTHER','Brother');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('39285905-2df3-5384-801c-80b6a770018b','SISTER','Sister');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('676aa3f7-873c-5ce4-8ed0-fc5101879ec1','GRANDFATHER','Grandfather');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('e692e6d6-967e-5b90-8320-425d6d9d9ce3','GRANDMOTHER','Grandmother');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('f8181e4b-b92e-5edc-835b-084ba7a8788d','PATERNAL-GRANDFATHER','Paternal grandfather');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('4a240f97-684f-5e36-8b39-69334dc54f5a','PATERNAL-GRANDMOTHER','Paternal grandmother');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('538202c4-2f71-5241-9fb7-fcde5b5052b3','MATERNAL-GRANDFATHER','Maternal grandfather');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('d2c86f40-3d5d-54c5-86fd-aa825a8edbd5','MATERNAL-GRANDMOTHER','Maternal grandmother');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('a3043a05-3814-5567-95cc-050913803777','UNCLE','Uncle');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('63a38182-423c-5594-81a7-6d5a6050a84a','AUNT','Aunt');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('22ffb0b1-0ca6-5bc1-b805-9b58cbcafab5','PATERNAL-UNCLE','Paternal uncle');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('e3713b48-2e67-5393-a582-f75a6a922b08','PATERNAL-AUNT','Paternal aunt');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('80c7dcf2-4b9f-52da-b0bd-4ccfc3920453','MATERNAL-UNCLE','Maternal uncle');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('aab2a052-e888-549e-9ef7-7e65cef3fbce','MATERNAL-AUNT','Maternal aunt');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('22f79f3a-6495-5949-bb4a-51ecb319307c','COUSIN','Cousin');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('59478988-f7cb-5f07-9b64-985299fc708f','LEGAL-GUARDIAN','Legal guardian');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('98fbe5f0-6527-5d4d-b1cf-21594297ae69','FOSTER-FATHER','Foster father');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('859fa3a2-0542-5175-92c3-6465907dc712','FOSTER-MOTHER','Foster mother');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('9f3e0734-6e5e-5fa4-a633-4286a48e0059','CAREGIVER','Caregiver');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('8c81b619-050f-5691-a724-f32856d77074','FAMILY-FRIEND','Family friend');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('3c61ba86-1cf2-5ef7-ba92-323e40db90ad','SPOUSE','Spouse');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('1118ed36-16a4-523c-847c-be3233d8d4d1','SELF','Self');
INSERT OR IGNORE INTO academy_guardian_relationships(id,code,name) VALUES ('e3339963-91f3-55ce-a688-f3a884f3d580','OTHER','Other');
INSERT OR IGNORE INTO academy_lead_sources(id,code,name) VALUES ('d92bafb9-4d79-528a-b0ec-1713acee02bf','WEBSITE','Website');
INSERT OR IGNORE INTO academy_lead_sources(id,code,name) VALUES ('30775c67-df3d-59f4-ad7e-48fd4eeef8a2','WALK-IN','Walk-in');
INSERT OR IGNORE INTO academy_lead_sources(id,code,name) VALUES ('a589c734-2f80-5536-a5ba-595669c9b4ef','PHONE','Phone');
INSERT OR IGNORE INTO academy_lead_sources(id,code,name) VALUES ('df69aec0-17ad-5fee-8d3e-c33029951ac4','FACEBOOK','Facebook');
INSERT OR IGNORE INTO academy_lead_sources(id,code,name) VALUES ('36ef4113-ef91-5e21-82b5-c60b98dbc6d1','TEACHER-REFERRAL','Teacher referral');
INSERT OR IGNORE INTO academy_lead_sources(id,code,name) VALUES ('9431aac9-fdc5-5cc1-a798-bf5538070d36','STUDENT-REFERRAL','Student referral');
INSERT OR IGNORE INTO academy_lead_sources(id,code,name) VALUES ('b3435490-09e6-57c8-b58f-c43dee31d4ee','GUARDIAN-REFERRAL','Guardian referral');
INSERT OR IGNORE INTO academy_lead_sources(id,code,name) VALUES ('cfb00143-db23-5c42-b05e-501205c949d3','SCHOOL-VISIT','School visit');
INSERT OR IGNORE INTO academy_lead_sources(id,code,name) VALUES ('4a816e4b-1687-57e6-b996-a8ae260eca73','LEAFLET','Leaflet');
INSERT OR IGNORE INTO academy_lead_sources(id,code,name) VALUES ('edc6ff8a-a359-557c-a2e2-b65675350ed6','BANNER','Banner');
INSERT OR IGNORE INTO academy_lead_sources(id,code,name) VALUES ('2908ccd9-d3d1-54ec-9660-7e01bf71a7b9','MIKING','Miking');
INSERT OR IGNORE INTO academy_lead_sources(id,code,name) VALUES ('08a627dd-245f-584a-a769-acd03726d9cb','OTHER','Other');
INSERT OR IGNORE INTO academic_groups(id,code,name) VALUES ('7399f494-9ff9-53dc-ac63-eb169a27f8ac','GENERAL','General');
INSERT OR IGNORE INTO academic_groups(id,code,name) VALUES ('5e6e246f-6250-5aa2-af10-3342ce9137a4','SCIENCE','Science');
INSERT OR IGNORE INTO academic_groups(id,code,name) VALUES ('a781ea35-f6ed-5c9b-aafb-9f848e9a461d','BUSINESS-STUDIES','Business Studies');
INSERT OR IGNORE INTO academic_groups(id,code,name) VALUES ('a05ceaa3-0dc2-5c54-baa8-88b4b55a5cf2','HUMANITIES','Humanities');
INSERT OR IGNORE INTO academic_groups(id,code,name) VALUES ('fd6b1d82-6068-5e9a-8ee4-5c98c0f07755','VOCATIONAL','Vocational');
INSERT OR IGNORE INTO academic_years(id,code,title,starts_on,ends_on,status) VALUES ('a5b69e02-7c3d-59bd-9ebe-65997a52c8b4','2026','Academic Year 2026','2026-01-01','2026-12-31','ACTIVE');
INSERT OR IGNORE INTO academic_years(id,code,title,starts_on,ends_on,status) VALUES ('04a93106-5a24-5433-bd61-27d05af39b7c','2027','Academic Year 2027','2027-01-01','2027-12-31','DRAFT');
INSERT OR IGNORE INTO academy_branches(id,code,name) VALUES ('d37e8966-90ab-555b-a0ee-a0f2843cd5a1','MAIN','Main Campus');
INSERT OR IGNORE INTO academy_programmes(id,code,name,description) VALUES ('127d8f54-d7bc-5419-afb5-fedec2687049','COACHING','Academic Coaching','Configure offerings, batches and fees before accepting applications.');
INSERT OR IGNORE INTO academy_programmes(id,code,name,description) VALUES ('ec04976b-9ac1-599e-be3c-7648204ce9a8','SSC','SSC Preparation','Configure offerings, batches and fees before accepting applications.');
INSERT OR IGNORE INTO academy_programmes(id,code,name,description) VALUES ('00deeb52-bf8c-53c1-a428-48c6637dc963','ENGLISH','Spoken English','Configure offerings, batches and fees before accepting applications.');
INSERT OR IGNORE INTO academy_programmes(id,code,name,description) VALUES ('563bf118-cb97-57ab-85cd-961617ad5503','EVENING','Evening Care','Configure offerings, batches and fees before accepting applications.');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('59f5fa50-061e-5bb9-b21b-d99ef444f566','SUB01','Bangla');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('b56436a6-66e7-5237-90ae-4431b26ef21f','SUB02','English');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('2a49f182-6ff5-5479-a9e6-6b4c4e117d36','SUB03','Mathematics');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('0d2fa23c-2f85-5509-9bc9-3d39480360e2','SUB04','General Science');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('8b3ef7c6-3634-5b3b-96dd-e503ab05433b','SUB05','Bangladesh and Global Studies');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('07973d14-5454-5065-a65e-e6fd1773f8b8','SUB06','ICT');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('61f850dd-0509-5a25-92de-9c0847785dea','SUB07','Physics');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('2dcee48c-5131-5d5f-b660-87efaa43baec','SUB08','Chemistry');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('9207a96a-4e04-5e9d-8379-77ae9cbc9daf','SUB09','Biology');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('e617b0ce-2ddb-5109-8661-a5714ba85a0f','SUB10','Higher Mathematics');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('4ac2f319-d564-59ef-974b-6edc8f8d1031','SUB11','Accounting');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('4cfc8b4c-5b15-56ad-a933-01a25b132cc0','SUB12','Finance and Banking');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('92436182-b057-51c6-9bc7-910eab41c34d','SUB13','Business Entrepreneurship');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('351ce2e3-dc17-5c7d-a4d5-4e3c7712d54d','SUB14','Economics');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('c9995075-6d2f-5b53-87d8-3ba1efa51b1b','SUB15','History');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('032023fc-e236-5987-867e-dac00affbe77','SUB16','Geography');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('f686705f-909e-5265-a482-848403fd762b','SUB17','Civics');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('596a8f82-eab6-53a8-84df-a8b9c4d0ab07','SUB18','Islam and Moral Education');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('960ab896-5d8d-54b5-8ddb-4fcadc83f53e','SUB19','Hindu Religion and Moral Education');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('b2cbae3d-faf5-5132-a1e2-97bd5d8a7acf','SUB20','Buddhist Religion and Moral Education');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('b10623fa-1f4a-522f-9ffd-cb22c4c1716b','SUB21','Christian Religion and Moral Education');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('811ff000-b5e0-5b15-846c-9f58ab1cca46','SUB22','Agriculture Studies');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('472a2cab-3afa-502b-88b8-a456a82d7457','SUB23','Home Science');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('845c0f43-f433-5030-be5a-05e2c0367298','SUB24','Physical Education');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('bbe9f874-483f-55a2-b844-bc3ff27626e3','SUB25','Career Education');
INSERT OR IGNORE INTO academic_subjects(id,code,title) VALUES ('2b8adb60-9ef6-59f0-886f-1016423a70b7','SUB26','Arts and Crafts');
INSERT OR IGNORE INTO finance_accounts(id,code,name,kind) VALUES
 ('sohoj-asset-cash','1000','Cash on hand','ASSET'),
 ('sohoj-asset-bank','1010','Bank deposits','ASSET'),
 ('sohoj-asset-mfs','1020','Mobile financial services','ASSET'),
 ('sohoj-asset-ar','1100','Student receivables','ASSET'),
 ('sohoj-liab-deferred','2200','Deferred tuition and admission fees','LIABILITY');
INSERT OR IGNORE INTO finance_accounts(id,code,name,kind)
VALUES ('sohoj-expense-operating','5100','Operating expenses','EXPENSE');
