import fs from "node:fs/promises";

const feeds = [
  ["MARKETS","https://news.google.com/rss/search?q=India%20Nifty%20Sensex%20stock%20market&hl=en-IN&gl=IN&ceid=IN:en"],
  ["MARKETS","https://news.google.com/rss/search?q=India%20RBI%20inflation%20rupee%20crude&hl=en-IN&gl=IN&ceid=IN:en"],
  ["PAINT","https://news.google.com/rss/search?q=Asian%20Paints%20Berger%20Paints%20Nerolac%20Indigo%20Paints%20JSW%20Paints%20Birla%20Opus&hl=en-IN&gl=IN&ceid=IN:en"],
  ["IT","https://news.google.com/rss/search?q=TCS%20Infosys%20Wipro%20HCLTech%20Tech%20Mahindra%20LTIMindtree%20Persistent%20Coforge&hl=en-IN&gl=IN&ceid=IN:en"],
  ["STARTUPS","https://news.google.com/rss/search?q=India%20startup%20funding%20IPO%20unicorn&hl=en-IN&gl=IN&ceid=IN:en"],
  ["M&A","https://news.google.com/rss/search?q=India%20acquisition%20merger%20M%26A%20deal&hl=en-IN&gl=IN&ceid=IN:en"]
];

function decode(s=""){
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,"$1")
    .replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
    .replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
    .replace(/&apos;/gi,"'").replace(/&amp;/gi,"&");
}
function stripHtml(s=""){
  return decode(s)
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<br\s*\/?>/gi," ")
    .replace(/<[^>]*>/g," ")
    .replace(/\s+/g," ").trim();
}
function tag(block,name){
  const m=block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,"i"));
  return m ? decode(m[1]).trim() : "";
}
function attr(block,name){
  const m=block.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`,"i"));
  return m ? decode(m[1]).trim() : "";
}
function parse(xml,section){
  const items=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
  return items.map(block=>{
    const description=tag(block,"description");
    const html=decode(description);
    const img=attr(html,"src") || attr(block,"url");
    return {
      section,
      title:stripHtml(tag(block,"title")),
      url:tag(block,"link"),
      description:stripHtml(description),
      image:img,
      date:tag(block,"pubDate")
    };
  }).filter(x=>x.title && x.url);
}
async function get(section,url){
  try{
    const r=await fetch(url,{headers:{"user-agent":"PICASO/1.0"},signal:AbortSignal.timeout(12000)});
    if(!r.ok) throw Error(String(r.status));
    return parse(await r.text(),section);
  }catch(e){
    console.log(`Feed skipped ${section}: ${e.message}`);
    return [];
  }
}

const positive=/growth|profit|order|contract|wins|raises|upgrade|strong|record|cut|deal/i;
const negative=/loss|decline|falls|drop|weak|layoff|downgrade|delay|probe|pressure|slump/i;
function score(x){
  const t=(x.title+" "+x.description).toLowerCase();
  let s=0;
  if(/india|indian|mumbai|bengaluru|delhi/.test(t)) s+=3;
  if(/rbi|repo|rate|inflation|gdp|rupee|inr|crude|oil|tariff|yield/.test(t)) s+=3;
  if(/asian paints|berger paints|nerolac|indigo paints|birla opus|jsw paints/.test(t)) s+=4;
  if(/tcs|infosys|wipro|hcltech|tech mahindra|ltimindtree|persistent|coforge/.test(t)) s+=4;
  if(/startup|funding|unicorn|venture|series a|series b|ipo/.test(t)) s+=2;
  if(/acquisition|acquires|acquired|merger|m&a|buyout|stake purchase/.test(t)) s+=4;
  return s;
}
function impact(t){
  const p=(t.match(positive)||[]).length,n=(t.match(negative)||[]).length;
  return p>n?"Potentially positive":n>p?"Potentially negative":"Mixed / needs context";
}
function model(t,section){
  if(/crude|oil/i.test(t)&&section==="PAINT") return "Review COGS and EBITDA-margin assumptions.";
  if(/rupee|inr|dollar|fx/i.test(t)&&section==="IT") return "Review FX sensitivity and reported revenue assumptions.";
  if(/rate|rbi|yield/i.test(t)) return "Review WACC and rate-sensitive assumptions.";
  if(/demand|volume|sales/i.test(t)&&section==="PAINT") return "Review volume and revenue-growth assumptions.";
  if(/margin|wage|salary|attrition/i.test(t)&&section==="IT") return "Review EBITDA-margin assumptions.";
  if(/acquisition|merger|buyout|stake/i.test(t)) return "Review purchase price, funding, synergies and accretion/dilution.";
  return "Do not change the model automatically; identify the economic driver first.";
}

const raw=(await Promise.all(feeds.map(([s,u])=>get(s,u)))).flat().sort((a,b)=>score(b)-score(a));
const seen=new Set(), unique=[];
for(const x of raw){
  const key=x.title.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,120);
  if(!seen.has(key)){seen.add(key);unique.push(x);}
}

const stories=unique.filter(x=>score(x)>=3).slice(0,12).map(x=>{
  const text=(x.description||"Source reports this development.").replace(/\s+/g," ");
  return {
    section:x.section,
    title:x.title,
    what:text.length>230?text.slice(0,227)+"…":text,
    why:x.section==="PAINT"?"Paint earnings are sensitive to demand, input costs and competitive intensity."
      :x.section==="IT"?"IT earnings are sensitive to demand, pricing, currency, wages and margins."
      :x.section==="M&A"?"The key questions are price, funding, strategic logic and integration risk."
      :x.section==="STARTUPS"?"Funding headlines matter less than growth, burn, runway and unit economics."
      :"The story matters if it changes earnings expectations, risk appetite or a key market variable.",
    impact:impact(x.title+" "+x.description),
    model:model(x.title+" "+x.description,x.section),
    reading_time:"20",
    source:"Google News",
    url:x.url,
    image:x.image||""
  };
});

const first=stories[0];
const cfa=first ? {
  concept:first.section==="M&A"?"M&A Valuation":first.section==="IT"?"Financial Statement Analysis":first.section==="PAINT"?"Industry & Company Analysis":"DCF",
  explanation:"Translate the headline into an economic driver instead of reacting to the headline itself.",
  application:"Identify the affected assumption, change it only if the evidence supports it, then run a sensitivity test."
} : {
  concept:"DCF",
  explanation:"Connect news to a forecast driver.",
  application:"Test the affected assumption."
};

const out={
  updated_at:new Date().toISOString(),
  edition:"PICASO — Daily Finance Brief",
  status:stories.length?"live":"no_fresh_stories",
  stories,
  cfa,
  model_check:"News should trigger a review of assumptions, not an automatic valuation change."
};
await fs.writeFile("news.json",JSON.stringify(out,null,2)+"\n");
console.log(`PICASO updated with ${stories.length} stories.`);
