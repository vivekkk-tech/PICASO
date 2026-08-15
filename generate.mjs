import fs from "node:fs/promises";

const feeds = [
 ["MARKETS","https://news.google.com/rss/search?q=India%20Nifty%20Sensex%20stock%20market&hl=en-IN&gl=IN&ceid=IN:en"],
 ["MARKETS","https://news.google.com/rss/search?q=India%20RBI%20inflation%20rupee%20crude&hl=en-IN&gl=IN&ceid=IN:en"],
 ["PAINT","https://news.google.com/rss/search?q=Asian%20Paints%20Berger%20Paints%20Nerolac%20Indigo%20Paints%20JSW%20Paints%20Birla%20Opus&hl=en-IN&gl=IN&ceid=IN:en"],
 ["IT","https://news.google.com/rss/search?q=TCS%20Infosys%20Wipro%20HCLTech%20Tech%20Mahindra%20LTIMindtree%20Persistent%20Coforge&hl=en-IN&gl=IN&ceid=IN:en"],
 ["STARTUPS","https://news.google.com/rss/search?q=India%20startup%20funding%20IPO%20unicorn&hl=en-IN&gl=IN&ceid=IN:en"],
 ["M&A","https://news.google.com/rss/search?q=India%20acquisition%20merger%20M%26A%20deal&hl=en-IN&gl=IN&ceid=IN:en"]
];

const clean=s=>String(s||"").replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
function tag(x,t){return clean(x.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`,"i"))?.[1]||"")}
function parse(xml,section){
 const blocks=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
 return blocks.map(b=>({section,title:tag(b,"title"),url:tag(b,"link"),description:tag(b,"description"),date:tag(b,"pubDate")})).filter(x=>x.title&&x.url)
}
async function get(section,url){
 try{const r=await fetch(url,{headers:{"user-agent":"PICASO/1.0"},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(r.status);return parse(await r.text(),section)}
 catch(e){console.log("Feed skipped",section,e.message);return[]}
}
const macro=/rbi|repo|rate|inflation|gdp|rupee|inr|crude|oil|tariff|yield/i;
const paint=/asian paints|berger paints|nerolac|indigo paints|birla opus|jsw paints/i;
const it=/tcs|infosys|wipro|hcltech|tech mahindra|ltimindtree|persistent|coforge/i;
const startup=/startup|funding|unicorn|venture|series a|series b|ipo/i;
const ma=/acquisition|acquires|acquired|merger|m&a|buyout|stake purchase/i;
const positive=/growth|profit|order|contract|wins|raises|upgrade|strong|record|cut/i;
const negative=/loss|decline|falls|drop|weak|layoff|downgrade|delay|probe|pressure|slump/i;
function score(x){let t=(x.title+" "+x.description).toLowerCase(),s=0;if(/india|indian|mumbai|bengaluru|delhi/.test(t))s+=3;if(macro.test(t))s+=3;if(paint.test(t)||it.test(t))s+=4;if(startup.test(t))s+=2;if(ma.test(t))s+=4;return s}
function impact(t){let p=(t.match(positive)||[]).length,n=(t.match(negative)||[]).length;return p>n?"POSITIVE":n>p?"NEGATIVE":"MIXED"}
function model(t,section){
 if(/crude|oil/i.test(t)&&section==="PAINT")return"Review COGS / EBITDA margin.";
 if(/rupee|inr|dollar/i.test(t)&&section==="IT")return"Review FX sensitivity and reported revenue assumptions.";
 if(/rate|rbi|yield/i.test(t))return"Review WACC and rate-sensitive assumptions.";
 if(/demand|volume|sales/i.test(t)&&section==="PAINT")return"Review volume and revenue-growth assumptions.";
 if(/margin|wage|salary|attrition/i.test(t)&&section==="IT")return"Review EBITDA-margin assumptions.";
 return"Do not change the model automatically; identify the driver first.";
}
const raw=(await Promise.all(feeds.map(x=>get(x[0],x[1])))).flat().sort((a,b)=>score(b)-score(a));
const seen=new Set(),items=[];
for(const x of raw){let k=x.title.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,100);if(!seen.has(k)){seen.add(k);items.push(x)}}
const stories=items.filter(x=>score(x)>=3).slice(0,12).map(x=>({
 section:x.section,title:x.title,what:(x.description||"Source reports this development.").split(/(?<=[.!?])\s+/)[0].slice(0,220),
 why:x.section==="PAINT"?"Paint earnings are sensitive to demand, input costs and competitive intensity.":x.section==="IT"?"IT earnings are sensitive to demand, pricing, currency, wages and margins.":x.section==="M&A"?"The key questions are price, funding, strategic logic and integration risk.":"The development matters if it changes earnings expectations, risk appetite or a key market variable.",
 impact:impact(x.title+" "+x.description),
 model:model(x.title+" "+x.description,x.section),
 reading_time:"20",source:"Google News RSS",url:x.url
}));
const cfa=stories[0]?{concept:stories[0].section==="M&A"?"M&A Valuation":stories[0].section==="IT"?"Financial Statement Analysis":"DCF",explanation:"Connect the headline to a valuation or financial-statement driver instead of reacting to the headline alone.",application:"Identify the driver, change only the affected assumption and test sensitivity.",source:stories[0].source,url:stories[0].url}:{concept:"DCF",explanation:"Connect news to a forecast driver.",application:"Test the affected assumption."};
const out={updated_at:new Date().toISOString(),edition:"PICASO — Daily Finance Brief",status:stories.length?"live":"no_fresh_stories",stories,cfa,model_check:"News should trigger a review of assumptions, not an automatic valuation change."};
await fs.writeFile("news.json",JSON.stringify(out,null,2)+"\n");
console.log(`PICASO updated with ${stories.length} stories.`);