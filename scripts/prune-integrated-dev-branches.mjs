/** User policy: keep master, dev and the current feature; remove only merged heads
 * after a successful dev deployment. Open PRs, protected refs and unique work stay.
 */
const repo=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN;
if(repo!=='AbdusSattar-70/sohojac'||!token||process.env.GITHUB_REF!=='refs/heads/dev')throw Error('Not authorized dev cleanup');
const current='feature/student-lifecycle-source-workflow';
const keep=new Set(['master','dev',current]);
const base='https://api.github.com/repos/'+repo;
async function github(path,method='GET'){
 const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
 if(method==='DELETE'&&response.status===204)return null;
 if(!response.ok)throw Error(`GitHub ${method} ${path} returned ${response.status}`);
 return response.json();
}
async function unchangedDev(){const dev=await github('/branches/dev');if(dev.commit.sha!==process.env.GITHUB_SHA)throw Error('Dev moved after tested deployment; cleanup stopped');}
await unchangedDev();
const open=await github('/pulls?state=open&per_page=100');
if(open.length>=100)throw Error('Open PR inventory requires pagination before cleanup');
const branches=[];
for(let page=1;;page++){
 const batch=await github('/branches?per_page=100&page='+page);branches.push(...batch);if(batch.length<100)break;
}
let deleted=0;
for(const observed of branches){
 const name=observed.name;
 if(keep.has(name)||observed.protected||open.some(p=>p.head?.repo?.full_name===repo&&p.head.ref===name))continue;
 const encoded=encodeURIComponent(name),sha=observed.commit.sha;
 const compare=await github('/compare/'+process.env.GITHUB_SHA+'...'+sha);
 if(compare.ahead_by!==0){console.log('Retained unique work: '+name);continue;}
 await unchangedDev();
 const latest=await github('/branches/'+encoded);
 if(latest.protected||latest.commit.sha!==sha){console.log('Retained changed/protected ref: '+name);continue;}
 // GitHub has no conditional branch-delete endpoint; recheck immediately above.
 await github('/git/refs/heads/'+encoded,'DELETE');deleted++;console.log('Deleted integrated branch: '+name);
}
console.log(`Removed ${deleted} merged branches; master, dev and ${current} retained.`);
