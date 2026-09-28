const crypto=require('crypto');
function ts(){const d=new Date(Date.now()+8*3600*1000);const p=n=>String(n).padStart(2,'0');return d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate())+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes())+':'+p(d.getUTCSeconds());}
function get(k){return process.env[k]||'';}

const PLANS={m10:10,m30:30,m100:100,y99:99,y299:299,y999:999,t30:6,t60:12,t300:60,t1000:200};
const MINPACK={t30:30,t60:60,t300:300,t1000:1000};
const LADDER=[[1,10],[2,30],[3,50],[5,70],[10,100]];
const WALLETS={
  base_primary:{chain:'Base',asset:'USDC',address:'0xa75Cc8545B169F0BeF2f29c9CCF86bc686D039E8',role:'主收款(平台)'},
  evm_payout:{chain:'EVM',asset:'USDC/ETH/USDT',address:'0x52513A733D4b52282F2b4f5A91D965D38b64f3BB',role:'Direct EVM Payout'},
  payout_usdc:{chain:'Base',asset:'USDC',address:'0x2C5dF5f91642B1214c28E51C67aEf1c61CbE1824',role:'Payout(USDC on Base)'},
  payment_usdc:{chain:'Base',asset:'USDC',address:'0x047b2A7fc72862a0e3E772eb53b19d35929BEd46',role:'Payment(USDC on Base)'},
  evm_alipay:{chain:'EVM',asset:'USDC/ETH',address:'0xDe37cDc93fC425e14EBdB827086E2144b31E855a',role:'EVM 收款'},
  cn_wallet:{chain:'EVM',asset:'多币',address:'0x5D36F4c480F900F0E7Ad0DC4fA0402554b972bF8',role:'国内收款到钱包'},
  solana_bounty:{chain:'Solana',asset:'SOL/usdc',address:'4moYJshT1bW71iESvwJHMynA5NFV534PJzFiKraydV6Z',role:'bounty 收款'}
};
function ladderPct(n){let pct=0;for(let i=0;i<LADDER.length;i++){if(n>=LADDER[i][0])pct=LADDER[i][1];}return Math.max(0,Math.min(100,pct));}

function baseFrom(req){
  const env=get('SITE_BASE');if(env)return env.replace(/\/$/,'');
  const h=(req&&req.headers)||{};
  const host=h['x-forwarded-host']||h.host||'bingdashan-pain-tools.vercel.app';
  const proto=h['x-forwarded-proto']||'https';
  return proto+'://'+String(host).split(',')[0].trim();
}
function sigKey(raw){
  raw=String(raw||'').trim();
  const b=raw.indexOf('-----BEGIN')>=0?raw:Buffer.from(raw.replace(/\s/g,''),'base64');
  if(Buffer.isBuffer(b)){try{return crypto.createPrivateKey({key:b,format:'der',type:'pkcs8'});}catch(e){}}
  return crypto.createPrivateKey('-----BEGIN PRIVATE KEY-----\n'+Buffer.from(String(raw).replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\r?\n/g,'')).toString('base64').match(/.{1,64}/g).join('\n')+'\n-----END PRIVATE KEY-----');
}
function verKey(raw){
  raw=String(raw||'').trim();
  const b=raw.indexOf('-----BEGIN')>=0?raw:Buffer.from(raw.replace(/\s/g,''),'base64');
  if(Buffer.isBuffer(b)){try{return crypto.createPublicKey({key:b,format:'der',type:'spki'});}catch(e){}}
  return crypto.createPublicKey('-----BEGIN PUBLIC KEY-----\n'+String(raw).replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\r?\n/g,'').match(/.{1,64}/g).join('\n')+'\n-----END PUBLIC KEY-----');
}
function signParams(params,priv){
  const signStr=Object.keys(params).sort().filter(k=>params[k]!==''&&params[k]!==undefined&&params[k]!==null).map(k=>k+'='+params[k]).join('&');
  return crypto.createSign('RSA-SHA256').update(signStr,'utf8').sign(sigKey(priv),'base64');
}
function aesConf(){
  const k=get('ALIPAY_AES_KEY');
  if(!k)return null;
  let b;
  try{b=Buffer.from(k,'base64');}catch(e){b=null;}
  if(!b||(b.length!==16&&b.length!==24&&b.length!==32))return null;
  return {key:b,iv:Buffer.alloc(b.length>=16?16:b.length)};
}
function aesEncrypt(plain){
  const c=aesConf();if(!c)return plain;
  const cph=crypto.createCipheriv('aes-'+(c.key.length*8)+'-cbc',c.key,c.iv);
  return cph.update(String(plain),'utf8','base64')+cph.final('base64');
}
function aesDecrypt(ct){
  const c=aesConf();if(!c)return null;
  try{
    const dcp=crypto.createDecipheriv('aes-'+(c.key.length*8)+'-cbc',c.key,c.iv);
    return dcp.update(String(ct),'base64','utf8')+dcp.final('utf8');
  }catch(e){return null;}
}
function alipayParams(biz,method,base,extra){
  const APP=get('ALIPAY_APP_ID'),PRIV=get('ALIPAY_MERCHANT_PRIVATE_KEY');
  if(!APP||!PRIV)return{error:'服务端缺少 ALIPAY_APP_ID 或 ALIPAY_MERCHANT_PRIVATE_KEY(请在 Vercel 环境变量配置)'};
  const plainBiz=JSON.stringify(biz);
  const encrypted=aesEncrypt(plainBiz);
  const params=Object.assign({app_id:APP,method:method,charset:'utf-8',sign_type:'RSA2',timestamp:ts(),version:'1.0',notify_url:base+'/api/notify',return_url:base+'/paid.html',format:'JSON',biz_content:encrypted},extra||{});
  if(encrypted!==plainBiz)params.encrypt_type='AES';
  params.sign=signParams(params,PRIV);return{params:params};
}
function verifyNotify(form){
  const PUB=get('ALIPAY_ALIPAY_PUBLIC_KEY');if(!PUB)return{ok:false,error:'缺少支付宝公钥'};
  const clean={};Object.keys(form).forEach(k=>{if(form[k]!==undefined&&form[k]!==null&&form[k]!==''&&k!=='sign'&&k!=='sign_type')clean[k]=form[k];});
  const signStr=Object.keys(clean).sort().map(k=>k+'='+clean[k]).join('&');
  let ok=false;try{ok=crypto.createVerify('RSA-SHA256').update(signStr,'utf8').verify(verKey(PUB),String(form.sign||''),'base64');}catch(e){ok=false;}
  let eff=Object.assign({},form);
  if(ok&&form.encrypt_type==='AES'&&String(form.biz_content||'').length>0){
    const dec=aesDecrypt(form.biz_content);
    if(dec){try{const j=JSON.parse(dec);Object.assign(eff,Object.fromEntries(Object.entries(j).filter(([k,v])=>eff[k]===undefined&&v!==undefined)));}catch(e){}}
  }
  const paid=ok&&eff.app_id===get('ALIPAY_APP_ID')&&(eff.trade_status==='TRADE_SUCCESS'||eff.trade_status==='TRADE_FINISHED')&&!!eff.out_trade_no;
  return {ok:ok&&paid,verified:ok,paid:paid,out_trade_no:eff.out_trade_no,trade_status:eff.trade_status,trade_no:eff.trade_no,buyer:eff.buyer_logon_id||eff.buyer_id,total:eff.total_amount||eff.amount,subject:eff.subject,decrypted:eff.biz_content!==form.biz_content};
}

function privFingerprint(){
  const PRIV=get('ALIPAY_MERCHANT_PRIVATE_KEY');
  if(!PRIV)return null;
  try{
    const jwk=crypto.createPublicKey(sigKey(PRIV)).export({format:'jwk'});
    const jn=String(jwk.n||'');
    const b=Buffer.from(jn.replace(/-/g,'+').replace(/_/g,'/'),'base64');
    return b.toString('hex').slice(0,32);
  }catch(e){return 'ERR:'+e.message;}
}

// ---------- persistence: Supabase (preferred) -> Vercel KV -> in-memory ----------
const MEM=new Map();
function sb(){const u=get('SUPABASE_URL')||get('NEXT_PUBLIC_SUPABASE_URL');const k=get('SUPABASE_SERVICE_KEY')||get('SUPABASE_SERVICE_ROLE_KEY')||get('SUPABASE_KEY');return (u&&k)?{u:u.replace(/\/$/,''),k:k}:null;}
function kv(){const u=get('KV_REST_API_URL')||get('UPSTASH_REDIS_REST_URL');const t=get('KV_REST_API_TOKEN')||get('UPSTASH_REDIS_REST_TOKEN');return (u&&t)?{u:u.replace(/\/$/,''),t:t}:null;}
async function saveOrder(rec){
  rec.updated_at=new Date().toISOString();
  const s=sb();
  if(s){try{
    const r=await fetch(s.u+'/rest/v1/bds_orders',{method:'POST',headers:{apikey:s.k,Authorization:'Bearer '+s.k,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([rec]),signal:AbortSignal.timeout(8000)});
    return {store:'supabase',ok:r.ok,status:r.status};
  }catch(e){return {store:'supabase',ok:false,error:e.message};}}
  const k=kv();
  if(k){try{
    const r=await fetch(k.u+'/set/bds_order_'+rec.out_trade_no,{method:'POST',headers:{Authorization:'Bearer '+k.t,'Content-Type':'application/json'},body:JSON.stringify(rec),signal:AbortSignal.timeout(8000)});
    return {store:'kv',ok:r.ok,status:r.status};
  }catch(e){return {store:'kv',ok:false,error:e.message};}}
  const prev=MEM.get(rec.out_trade_no)||{};MEM.set(rec.out_trade_no,Object.assign(prev,rec));
  return {store:'memory',ok:true};
}
async function getOrder(out){
  const s=sb();
  if(s){try{
    const r=await fetch(s.u+'/rest/v1/bds_orders?out_trade_no=eq.'+encodeURIComponent(out)+'&select=*',{headers:{apikey:s.k,Authorization:'Bearer '+s.k},signal:AbortSignal.timeout(8000)});
    const j=await r.json();return (Array.isArray(j)&&j[0])?j[0]:null;
  }catch(e){return null;}}
  const k=kv();
  if(k){try{
    const r=await fetch(k.u+'/get/bds_order_'+out,{headers:{Authorization:'Bearer '+k.t},signal:AbortSignal.timeout(8000)});
    const j=await r.json();return j&&j.result?JSON.parse(j.result):null;
  }catch(e){return null;}}
  return MEM.get(out)||null;
}
async function countInvited(inv){
  const s=sb();if(!s||!inv)return null;
  try{
    const r=await fetch(s.u+'/rest/v1/bds_orders?invited_by=eq.'+encodeURIComponent(inv)+'&status=eq.paid&select=out_trade_no',{headers:{apikey:s.k,Authorization:'Bearer '+s.k},signal:AbortSignal.timeout(8000)});
    const j=await r.json();return Array.isArray(j)?j.length:0;
  }catch(e){return null;}
}
async function listByRef(ref){
  const s=sb();if(!s||!ref)return [];
  try{
    const r=await fetch(s.u+'/rest/v1/bds_orders?ref=eq.'+encodeURIComponent(ref)+'&status=eq.paid&select=slug,plan,out_trade_no,trade_no,amount',{headers:{apikey:s.k,Authorization:'Bearer '+s.k},signal:AbortSignal.timeout(8000)});
    const j=await r.json();return Array.isArray(j)?j:[];
  }catch(e){return [];}
}
function storeKind(){return sb()?'supabase':(kv()?'kv':'memory');}
const MEMKV=new Map();
async function dbGet(key){
  const k=kv();
  if(k){try{const r=await fetch(k.u+'/get/'+encodeURIComponent('bds_'+key),{headers:{Authorization:'Bearer '+k.t},signal:AbortSignal.timeout(8000)});const j=await r.json();return j&&j.result?JSON.parse(j.result):null;}catch(e){}}
  const s=sb();
  if(s){try{const r=await fetch(s.u+'/rest/v1/bds_kv?k=eq.'+encodeURIComponent(key)+'&select=v',{headers:{apikey:s.k,Authorization:'Bearer '+s.k},signal:AbortSignal.timeout(8000)});const j=await r.json();return (Array.isArray(j)&&j[0])?j[0].v:null;}catch(e){}}
  return MEMKV.has(key)?MEMKV.get(key):null;
}
async function dbSet(key,val){
  const k=kv();
  if(k){try{await fetch(k.u+'/set/'+encodeURIComponent('bds_'+key),{method:'POST',headers:{Authorization:'Bearer '+k.t,'Content-Type':'application/json'},body:JSON.stringify(val),signal:AbortSignal.timeout(8000)});return true;}catch(e){}}
  const s=sb();
  if(s){try{await fetch(s.u+'/rest/v1/bds_kv',{method:'POST',headers:{apikey:s.k,Authorization:'Bearer '+s.k,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{k:key,v:val}]),signal:AbortSignal.timeout(8000)});return true;}catch(e){}}
  MEMKV.set(key,val);return true;
}
const INVITE_CAP=50;
async function arcBonus(ref){
  const list=(await dbGet('arc_inv_'+ref))||[];
  return {friends:list.length,bonusSeconds:Math.min(list.length,INVITE_CAP)*600};
}

// ---------- alipay calls ----------
async function probePagePay(base){
  const r=alipayParams({out_trade_no:'T'+Date.now(),total_amount:'0.01',subject:'probe',product_code:'FAST_INSTANT_TRADE_PAY'},'alipay.trade.page.pay',base);
  if(r.error)return{error:r.error};
  const res=await fetch('https://openapi.alipay.com/gateway.do',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(r.params).toString(),redirect:'manual',signal:AbortSignal.timeout(20000)});
  let final=res.headers.get('location')||'';
  const txt=final?'':await res.text();
  let hops=0;
  while(final&&hops<3&&/appAssign/.test(final)){const rr=await fetch(final,{redirect:'manual',signal:AbortSignal.timeout(15000)});const nx=rr.headers.get('location')||'';if(!nx)break;final=nx;hops++;}
  const cashier=/excashier\.alipay\.com\/(standard\/)?auth\.htm|excashier\.alipay\.com\/cashier/.test(final);
  const fish=/FISHING_RISK|钓鱼/.test(final)||/钓鱼/.test(txt);
  let bizCode=null;try{const m=txt.match(/"code"\s*:\s*"(\d+)"/);if(m)bizCode=m[1];}catch(e){}
  return {http:res.status,cashier:cashier,final:String(final).slice(0,160),code:bizCode,verdict:cashier?'PASS (已生成收银台订单)':(fish?'FISHING_RISK (服务端直连被风控;浏览器端实测正常)':'NO-PERM/ERROR')};
}
async function alipayQuery(outTradeNo,mode){
  const APP=get('ALIPAY_APP_ID'),PRIV=get('ALIPAY_MERCHANT_PRIVATE_KEY');
  if(!APP||!PRIV)return{error:'缺 ALIPAY_APP_ID/私钥'};
  const params={app_id:APP,method:'alipay.trade.query',charset:'utf-8',sign_type:'RSA2',timestamp:ts(),version:'1.0',format:'JSON'};
  const plainBiz=JSON.stringify({out_trade_no:outTradeNo});
  const encrypted=mode==='plain'?plainBiz:aesEncrypt(plainBiz);
  params.biz_content=encrypted;
  if(encrypted!==plainBiz)params.encrypt_type='AES';
  params.sign=signParams(params,PRIV);
  const res=await fetch('https://openapi.alipay.com/gateway.do',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params).toString(),signal:AbortSignal.timeout(20000)});
  const txt=await res.text();let j={};try{j=JSON.parse(txt);}catch(e){return{http:res.status,raw:txt.slice(0,400)};}
  let r=j.alipay_trade_query_response||{};
  if((j.encrypt_type==='AES'||r.encrypt_type==='AES')&&typeof r==='string'){r=JSON.parse(aesDecrypt(r)||'{}');}
  if(j.encrypt_type==='AES'&&typeof r==='string'&&r.indexOf('{')!==0){r={raw_cipher:r};}
  const paid=(r.code==='10000'&&(r.trade_status==='TRADE_SUCCESS'||r.trade_status==='TRADE_FINISHED'));
  return {http:res.status,code:r.code,msg:r.msg,sub:r.sub_code,trade_status:r.trade_status,trade_no:r.trade_no,buyer:r.buyer_logon_id||r.buyer_user_id,amount:r.total_amount,paid:!!paid,detail:r,resp_encrypt:!!(j.encrypt_type||r.encrypt_type)};
}
function readBody(req){return new Promise(res=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>res(d));});}
function esc(v){return String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}

module.exports=async(req,res)=>{
  const u=new URL((req.url||'/'),'http://x');
  let route=u.searchParams.get('r')||u.pathname;
  route='/'+String(route).replace(/^\/+/,'').replace(/^api\//,'');
  if(route.indexOf('/api/')!==0)route='/api'+route;
  const base=baseFrom(req);
  const send=(c,o)=>{res.writeHead(c,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(o));};
  const text=(c,s,ct)=>{res.writeHead(c,{'Content-Type':ct||'text/plain; charset=utf-8'});res.end(s);};
  const raw=await readBody(req);
  let form={};try{const u2=new URL(u.search.slice(1),'http://x');u2.searchParams.forEach((v,k)=>form[k]=v);}catch(e){}
  if(raw){try{Object.assign(form,JSON.parse(raw));}catch(e){try{const u3=new URL('http://x/?'+raw);u3.searchParams.forEach((v,k)=>form[k]=v);}catch(e2){}}}
  const data=Object.assign(Object.fromEntries(u.searchParams),form);
  try{
    // 创建付款单 → 返回自动提交的收银台表单
    if(route==='/api/pay'){
      const plan=data.plan||'m10';
      const price=PLANS[plan];
      if(!price){send(200,{ok:false,error:'未知套餐 plan='+plan});return;}
      const slug=String(data.slug||'tool').slice(0,120);
      const ref=String(data.ref||'').slice(0,32);
      const inv=String(data.inv||'').slice(0,32);
      const out=data.out_trade_no||('BDS_'+ref+'_'+plan+'_'+Date.now());
      let pct=0;
      const cnt=await countInvited(inv);
      if(cnt!==null){pct=ladderPct(cnt);}
      else{const cp=parseInt(data.pct,10);pct=(isFinite(cp)?Math.max(0,Math.min(70,cp)):0);}
      const amount=(price*(1-pct/100)).toFixed(2);
      await saveOrder({out_trade_no:out,slug:slug,ref:ref,invited_by:inv,plan:plan,list_price:String(price),pct:pct,amount:amount,status:'created'});
      const r=alipayParams({out_trade_no:out,total_amount:amount,subject:String(data.subject||('bingdashan '+plan+' unlock')).replace(/[^\x20-\x7e]/g,'').slice(0,120)||('bingdashan '+plan),product_code:'FAST_INSTANT_TRADE_PAY',timeout_express:'15m'},'alipay.trade.page.pay',base,{passback_params:encodeURIComponent(JSON.stringify({slug:slug,plan:plan,ref:ref,inv:inv}))});
      if(r.error){send(200,{ok:false,error:r.error});return;}
      const html='<!DOCTYPE html><html><head><meta charset="utf-8"><title>正在跳转支付宝…</title></head><body style="font-family:system-ui;text-align:center;padding:40px">正在跳转支付宝收银台…<form id="f" action="https://openapi.alipay.com/gateway.do" method="POST" accept-charset="utf-8">'+Object.keys(r.params).map(k=>'<input type="hidden" name="'+k+'" value="'+esc(r.params[k])+'"/>').join('')+'</form><script>document.getElementById("f").submit();</script></body></html>';
      text(200,html,'text/html; charset=utf-8');return;
    }
    // 支付宝异步回调:验签 + 落库,必须返回纯文本 success
    if(route==='/api/notify'){
      const r=verifyNotify(data);
      if(r.ok){
        const prev=(await getOrder(r.out_trade_no))||{};
        await saveOrder(Object.assign({},prev,{out_trade_no:r.out_trade_no,trade_no:r.trade_no,buyer:r.buyer,amount:r.total,trade_status:r.trade_status,status:'paid',paid_at:new Date().toISOString()}));
        text(200,'success');return;
      }
      text(400,'fail');return;
    }
    // 查单:以支付宝为准(幂等),顺带回写落库
    if(route==='/api/order'){
      const out=String(data.out_trade_no||'');
      if(!out){send(200,{ok:false,error:'缺 out_trade_no'});return;}
      const q=await alipayQuery(out);
      const rec=(await getOrder(out))||{out_trade_no:out};
      if(q.paid){
        await saveOrder(Object.assign({},rec,{out_trade_no:out,trade_no:q.trade_no,buyer:q.buyer,amount:q.amount,trade_status:q.trade_status,status:'paid',paid_at:(rec&&rec.paid_at)||new Date().toISOString()}));
      }
      send(200,{ok:true,paid:!!q.paid,status:q.paid?'paid':(rec.status||'unknown'),trade_status:q.trade_status,trade_no:q.trade_no,slug:rec.slug||null,plan:rec.plan||null,code:q.code,sub:q.sub,msg:q.msg});
      return;
    }
    // 按推荐人 ref 查已解锁工具(跨设备)
    if(route==='/api/entitle'){
      const ref=String(data.ref||'').slice(0,32);
      if(!ref){send(200,{ok:false,error:'缺 ref'});return;}
      if(storeKind()==='memory'){send(200,{ok:true,store:'memory',ref:ref,slugs:[]});return;}
      const rows=await listByRef(ref);
      const slugs=Array.from(new Set(rows.map(x=>x.slug).filter(Boolean)));
      const cnt=await countInvited(ref);
      send(200,{ok:true,store:storeKind(),ref:ref,slugs:slugs,orders:rows.length,friends:cnt,pct:ladderPct(cnt||0)});
      return;
    }
    // AI 娱乐中心:时长状态 / 心跳 / 邀请奖励
    if(route==='/api/arcade'){
      const ref=String(data.ref||'').slice(0,32);
      const by=String(data.by||'').slice(0,32);
      const slugv=String(data.slug||'').slice(0,80);
      const act=String(data.a||'state');
      if(!ref){send(200,{ok:false,error:'缺 ref'});return;}
      if(act==='invite'&&by&&by!==ref){
        const list=(await dbGet('arc_inv_'+ref))||[];
        if(list.indexOf(by)<0)list.push(by);
        await dbSet('arc_inv_'+ref,list);
        const inviterBonus=Math.min(list.length,INVITE_CAP)*600;
        await dbSet('arc_bonus_'+ref,inviterBonus);
        await dbSet('arc_bonus_'+by,Math.max(600,parseInt((await dbGet('arc_bonus_'+by))||0,10)||0));
        const mine=await dbGet('arc_inv_'+by);
        send(200,{ok:true,friends:list.length,bonusSeconds:inviterBonus,inviteeBonus:600,store:storeKind()});return;
      }
      // 服务器权威计费:免费额度一次性入账、心跳按服务器时钟扣钱,绝不信任客户端自报 bal
      const freeLeft=parseInt((await dbGet('arc_free_'+ref))||0,10)||0;
      if(!(await dbGet('arc_init_'+ref))&&freeLeft<=0){
        await dbSet('arc_free_'+ref,FREE_SEC);
        await dbSet('arc_init_'+ref,'1');
      }
      let balanceSeconds=parseInt((await dbGet('arc_bal_'+ref))||0,10)||0;
      if(act==='tick'){
        const now=Date.now();
        const hb=parseInt((await dbGet('arc_hb_'+ref))||0,10)||0;
        // 服务器自己计时:相邻两次心跳之间的真实时间(上限 90s,防刷新/跳时间戳刷秒)
        let elapsed=0;
        if(hb)elapsed=Math.max(0,Math.min(90,Math.floor((now-hb)/1000)));
        await dbSet('arc_hb_'+ref,now);
        if(slugv)await dbSet('arc_use_'+ref,{slug:slugv,at:new Date().toISOString()});
        if(elapsed>0){
          // 先扣免费额度,再扣付费余额(服务器侧权威)
          let fl=Math.max(0,parseInt((await dbGet('arc_free_'+ref))||0,10)||0);
          let take=Math.min(fl,elapsed);fl-=take;
          let br=elapsed-take;
          if(br>0){
            const sb=parseInt((await dbGet('arc_bonus_'+ref))||0,10)||0;
            const effBonus=Math.max(b.bonusSeconds,sb);
            balanceSeconds=Math.max(0,balanceSeconds+effBonus-br);
          }
          await dbSet('arc_free_'+ref,fl);
          await dbSet('arc_bal_'+ref,balanceSeconds);
        }
      }
      const sb3=(await dbGet('arc_bonus_'+ref))||0;
      const freeRemaining=parseInt((await dbGet('arc_free_'+ref))||0,10)||0;
      send(200,{ok:true,store:storeKind(),ref:ref,friends:b.friends,bonusSeconds:Math.max(b.bonusSeconds,parseInt(sb3,10)||0),balanceSeconds:balanceSeconds,freeSeconds:freeRemaining});return;
    }
    if(route==='/api/verify'){
      const r=await probePagePay(base);
      send(200,{ok:true,result:r,verdict:r.verdict||('ERROR '+(r.error||''))});
      return;
    }
    if(route==='/api/aliq'){
      const out=String(data.out_trade_no||'BDS_ALIQ_PROBE_'+(Date.now()%1000000));
      const mode=String(data.mode||(get('ALIPAY_AES_KEY')?'aes':'plain'));
      const q=await alipayQuery(out,mode);
      const body={ok:true,probe:'alipay.trade.query',out_trade_no:out,mode:mode,aes_configured:!!get('ALIPAY_AES_KEY'),result:q};
      if(String(data.debug)==='1')body.sig_fp=privFingerprint();
      send(200,body);return;
    }
    if(route==='/api/paid'){
      send(200,{ok:true,received:data,base:base,store:storeKind()});return;
    }
    if(route==='/api/config'){send(200,{ok:true,app_id:get('ALIPAY_APP_ID'),account:get('ALIPAY_ACCOUNT'),base:base,store:storeKind(),plans:PLANS,wallets:WALLETS,ready:!!(get('ALIPAY_APP_ID')&&get('ALIPAY_MERCHANT_PRIVATE_KEY')&&get('ALIPAY_ALIPAY_PUBLIC_KEY'))});return;}
    if(route==='/api/health'){send(200,{ok:true,env:{app:!!get('ALIPAY_APP_ID'),priv:!!get('ALIPAY_MERCHANT_PRIVATE_KEY'),pub:!!get('ALIPAY_ALIPAY_PUBLIC_KEY'),supabase:!!sb(),kv:!!kv()},store:storeKind()});return;}
    send(404,{ok:false,error:'not found',route:route});
  }catch(e){send(500,{ok:false,error:e.message,stack:(e.stack||'').split('\n').slice(0,3)});}
};
