import assert from 'node:assert/strict';
import {test} from 'node:test';
import {offeringSubjectOptions,subjectOptionLabel} from '../lib/offering-subject-options.ts';
const rows=[{id:'ban4',code:'BAN',name:'Bangla',class_grade:4,group_name:'GENERAL'},{id:'ban10',code:'BAN',name:'Bangla',class_grade:10,group_name:'GENERAL'},{id:'phy10',code:'PHY',name:'Physics',class_grade:10,group_name:'SCIENCE'},{id:'acc10',code:'ACC',name:'Accounting',class_grade:10,group_name:'BUSINESS'}];
const offering={class_name:'Class 10',class_code:'CLASS10',group_name:'Business Studies',operation_kind:'COACHING'};
test('business offering shows one class-specific Bangla and business subjects, without other grades/science',()=>{assert.deepEqual(offeringSubjectOptions(rows,offering,[]).eligible.map(s=>s.id),['ban10','acc10']);});
test('science offering includes common and science subjects',()=>{assert.deepEqual(offeringSubjectOptions(rows,{...offering,group_name:'Science'},[]).eligible.map(s=>s.id),['ban10','phy10']);});
test('existing out-of-context assignments remain visible for explicit correction',()=>{const result=offeringSubjectOptions(rows,offering,['ban4']);assert.deepEqual(result.retained.map(s=>s.id),['ban4']);assert.match(subjectOptionLabel(result.retained[0]),/Class 4/);});
test('training and unknown class names keep fully labelled choices rather than guessing a grade',()=>{assert.equal(offeringSubjectOptions(rows,{...offering,operation_kind:'TRAINING',group_name:null},[]).eligible.length,4);assert.equal(offeringSubjectOptions(rows,{...offering,class_code:null,class_name:'Senior intake',group_name:null},[]).eligible.length,4);});
test('Class 1 cannot match Class 10 and labels distinguish otherwise identical names',()=>{assert.equal(offeringSubjectOptions(rows,{...offering,class_code:'CLASS1',class_name:'Class 1'},[]).eligible.length,0);assert.notEqual(subjectOptionLabel(rows[0]),subjectOptionLabel(rows[1]));});

test('inactive linked subjects remain removable and cannot be newly selected',()=>{const inactive={...rows[1],id:'inactive',active:0};const result=offeringSubjectOptions([...rows,inactive],offering,['inactive']);assert.ok(!result.eligible.some(s=>s.id==='inactive'));assert.equal(result.retained[0].id,'inactive');assert.match(subjectOptionLabel(inactive),/Inactive/);});
