/**
 * Delete only explicitly allowlisted historical branches whose EXACT observed SHA
 * is already an ancestor of dev. Never delete master, dev, public rollback,
 * a protected branch, the Admissions working branch, an open-PR head or anything with new commits.
 *
 * Runs after a green dev deployment. Requires GITHUB_TOKEN contents:write.
 */
const repo=process.env.GITHUB_REPOSITORY;
const token=process.env.GITHUB_TOKEN;
if(repo!=="AbdusSattar-70/sohojac"||!token||
 process.env.GITHUB_REF!=="refs/heads/dev")throw Error("Not authorized dev cleanup");
const names={
 "feature/erp-dark-only-staff-mail-setup": "d66af6f3804dd5e912a4cbc5f3d432ed9f6c64d5",
 "feature/legacy-staff-number-parity-20261029": "bb63bc2f2c14aa58d51ee088bd2791cabf5d0a70",
 "feature/public_site_port": "47463eb81e85020f230b18b1065c751eabd9cc16",
 "fix/manual-master-email-deploy-20261029": "124cddce4fc52037b1858521b089e04bb0f92b43",
 "fix/master-optional-staff-mail-20261029": "70e870f171f1ef79252ec36bca08cf8cac9d801c",
 "refactor/original-erp-architecture-20261029": "4aab163e6c800197d07d4ab53ffa85ad61078afb",
 "release/academic-years-20261029": "755908154e9bd5f80edc3f88b75bc2594e45b355",
 "release/batches-20261029": "d82934343aa189b4da41c66ad1f5e38f5ba3eae3",
 "release/programme-offerings-20261029": "ecdcebc7cef0d6072255e07a3a787d6786a728d9"
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
 if(["dev","master","feature/admissions-source-parity"].includes(branch))throw Error("Unsafe cleanup candidate");
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
