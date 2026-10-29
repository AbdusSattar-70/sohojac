/**
 * Delete only explicitly allowlisted feature branches whose EXACT observed SHA
 * is already an ancestor of dev. Never delete master, dev, public rollback,
 * a protected branch, an open-PR head or anything with new commits.
 *
 * Runs after a green dev deployment. Requires GITHUB_TOKEN contents:write.
 */
const repo=process.env.GITHUB_REPOSITORY;
const token=process.env.GITHUB_TOKEN;
if(repo!=="AbdusSattar-70/sohojac"||!token||
 process.env.GITHUB_REF!=="refs/heads/dev")throw Error("Not authorized dev cleanup");
const names={
 "feature/erp_access_lifecycle":"9ef4a8d7c979062b8989db0c5951aaa32c36286c",
 "feature/erp_dashboard_shell":"54e666fce6ede49d9b8470c2ba4f0b7da041ead0",
 "feature/source-offerings-d1-contract-20261029":"c6c0136a3f142875e9c537c69d0b1929fccefe01",
 "feature/staff_crm_better_auth":"ea75771e8835cca61a1097fe161677fe9c85a8db",
 "fix/dynamic-programme-status":"399c48a2484d2f5d5a0e8c918ff83151c5a863b9",
 "migration/source-first-full-erp-parity-20261029":"e5ec5c7a2ad2199925d3a9253bdc47ad5eb710d0",
 "release/master-consolidation-20261029":"d1cf3699a53fd23e7495ddfab3d91ab042f5e768",
};
const base="https://api.github.com/repos/"+repo;
async function github(path,method="GET"){
 const response=await fetch(base+path,{
  method,headers:{
   Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28"
  }
 });
 if(method==="DELETE"&&response.status===204)return null;
 if(!response.ok)throw Error("GitHub "+method+" "+path+" returned "+response.status);
 return response.json();
}
const dev=await github("/branches/dev");
if(dev?.commit?.sha!==process.env.GITHUB_SHA)throw Error("dev moved after green CI: skip cleanup");
const open=await github("/pulls?state=open&per_page=100");
if(open.length>=100)throw Error("Too many open PRs to verify safely");
let deleted=0;
for(const [branch,observedSha] of Object.entries(names)){
 if(["dev","master","feature/public_site_port"].includes(branch))throw Error("Unsafe cleanup candidate");
 const url=encodeURIComponent(branch);
 const entry=await github("/branches/"+url).catch(e=>{
  if(String(e).includes("404"))return null;throw e;
 });
 if(!entry){console.log("Already deleted: "+branch);continue;}
 if(entry.protected||entry.commit.sha!==observedSha){
  console.log("Retained updated/protected branch "+branch);continue;
 }
 if(open.some(p=>p.head?.repo?.full_name===repo&&p.head?.ref===branch)){
  console.log("Retained open PR branch "+branch);continue;
 }
 const compare=await github("/compare/dev..."+url);
 if(compare.ahead_by!==0){
  console.log("Retained branch with unique work "+branch);continue;
 }
 await github("/git/refs/heads/"+url,"DELETE");
 console.log("Deleted integrated branch: "+branch);
 deleted++;
}
console.log("Development branch cleanup completed; "+deleted+" merged-only branches pruned.");
