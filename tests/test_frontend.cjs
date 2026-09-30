const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/../visit.js','utf8');
const memory=()=>{const data=new Map();return{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};};
async function boot(localStorage,sessionStorage){
 const requests=[],timers=[],elements=[],listeners={};
 const footer={append(el){elements.push(el);}};
 const document={hidden:false,body:{append(el){elements.push(el);}},createElement(){return{setAttribute(){},addEventListener(k,fn){this[k]=fn;},remove(){this.removed=true;}};},querySelector:()=>footer,querySelectorAll:()=>[],addEventListener(k,fn){listeners[k]=fn;}};
 const context={document,localStorage,sessionStorage,location:{origin:'https://giotzu68.github.io',pathname:'/otc-comunita-connesse/',hash:'#esperienza'},crypto:require('crypto').webcrypto,Date,Set,JSON,Number,Math,innerHeight:800,AbortSignal,IntersectionObserver:class{observe(){}},setTimeout:fn=>timers.push(fn),setInterval:fn=>timers.push(fn),fetch:async(url,opt)=>{requests.push({url,data:JSON.parse(opt.body)});return{ok:true,json:async()=>({token:'e'.repeat(64)})};},window:{addEventListener(){}}};
 vm.runInNewContext(code,context);
 const tick=async()=>{for(const fn of timers)fn();await new Promise(r=>setImmediate(r));};
 const choose=async value=>{const panel=elements.findLast(e=>e.click&&!e.removed);panel.click({target:{closest:()=>({dataset:{choice:value}})}});await new Promise(r=>setImmediate(r));};
 return{requests,tick,choose,elements,listeners};
}
(async()=>{
 const local=memory(),session=memory();let app=await boot(local,session);await app.tick();assert.equal(app.requests[0].data.consent,false);assert(!('visitor'in app.requests[0].data));
 await app.choose('yes');assert.equal(app.requests[1].data.consent,true);assert.equal(app.requests[1].data.count,1);assert.equal(app.requests[1].url.endsWith('/visit/update'),true);
 const id=app.requests[1].data.visitor;
 app=await boot(local,session);await app.tick();assert.equal(app.requests[0].data.count,1);assert.equal(app.requests[0].data.visitor,id);
 app=await boot(local,memory());await app.tick();assert.equal(app.requests[0].data.count,2);assert.equal(app.requests[0].data.visitor,id);
 app.elements[0].click();await app.choose('no');assert.equal(app.requests.at(-1).data.consent,false);assert(!('visitor'in app.requests.at(-1).data));assert.equal(local.getItem('otc-visitor-v2'),null);
 console.log('Frontend checks passed: baseline, consent, same-session reload, return visit, revocation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
