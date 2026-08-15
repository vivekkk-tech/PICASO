let all=[],filter="ALL";
const $=s=>document.querySelector(s);
function esc(x){return String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function render(){
 const list=filter==="ALL"?all:all.filter(x=>x.section===filter);
 $("#stories").innerHTML=list.length?list.map(x=>`<article class="card">
 <div class="meta"><span class="section">${esc(x.section)}</span><span class="time">~${esc(x.reading_time||"20")} SEC</span></div>
 <h3>${esc(x.title)}</h3><p>${esc(x.what)}</p>
 <div class="rows"><div class="row"><b>WHY:</b> ${esc(x.why)}</div><div class="row"><b>MARKET IMPACT:</b> ${esc(x.impact)}</div><div class="row"><b>MODEL:</b> ${esc(x.model)}</div></div>
 <div class="source">${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">Source: ${esc(x.source||"Original source")}</a>`:"Source: "+esc(x.source||"PICASO")}</div>
 </article>`).join(""):`<div class="card"><h3>No stories in this section.</h3><p>Run the daily update or choose ALL.</p></div>`;
}
async function load(){
 try{
  const r=await fetch("news.json?ts="+Date.now(),{cache:"no-store"}); if(!r.ok)throw Error("news.json unavailable");
  const d=await r.json(); all=d.stories||[];
  $("#status").textContent=d.updated_at?"Updated "+new Date(d.updated_at).toLocaleString("en-IN"):"Waiting for first update";
  if(d.cfa){$("#cfa").innerHTML=`<b>${esc(d.cfa.concept)}</b> — ${esc(d.cfa.explanation)} <br><br><b>Use it:</b> ${esc(d.cfa.application)}`}
  if(d.model_check)$("#model").textContent=d.model_check;
  render();
 }catch(e){$("#status").textContent="Could not load edition";$("#stories").innerHTML='<div class="card"><h3>Edition unavailable</h3><p>Check that news.json exists beside index.html.</p></div>'}
}
document.querySelectorAll("#filters button").forEach(b=>b.onclick=()=>{document.querySelectorAll("#filters button").forEach(x=>x.classList.remove("active"));b.classList.add("active");filter=b.dataset.filter;render()});
$("#refresh").onclick=load;$("#date").textContent=new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});load();