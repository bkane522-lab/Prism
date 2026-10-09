import test from 'node:test';
import assert from 'node:assert/strict';
let index = 0;
async function fixture({token='test-token', permalink='tgmmus', id='', responses=[]}={}){
  process.env.GUMROAD_ACCESS_TOKEN=token;
  process.env.GUMROAD_PRODUCT_PERMALINK=permalink;
  process.env.GUMROAD_PRODUCT_ID=id;
  const calls=[];
  globalThis.fetch=async(url, options)=>{
    calls.push({url:new URL(url),options});
    const data=responses.shift();
    if(data instanceof Error) throw data;
    assert.ok(data, 'Appel API inattendu');
    return {ok:data.success!==false, json:async()=>data};
  };
  const {default:handler}=await import(`../api/license.js?test=${++index}`);
  return {calls, async run(body={email:'buyer@example.com'}, method='POST'){
    const result={headers:{}};
    const res={setHeader:(k,v)=>result.headers[k]=v,status:s=>{result.status=s;return res;},json:b=>{result.body=b;return result;}};
    await handler({method,body,headers:{'x-forwarded-for':'192.0.2.1'}},res);
    return result;
  }};
}
const products={success:true,products:[{id:'exact-id',short_url:'https://gumroad.com/l/tgmmus'}]};
const sale=(overrides={})=>({email:'buyer@example.com',product_id:'exact-id',refunded:false,...overrides});
test('configuration absente et méthode interdite',async()=>{
  const f=await fixture({token:''});
  assert.equal((await f.run()).body.reason,'config');
  assert.equal((await f.run({},'GET')).status,405);
  assert.equal(f.calls.length,0);
});
test('adresse invalide refusée sans appel Gumroad',async()=>{
  const f=await fixture();
  assert.equal((await f.run('{invalid json')).status,400);
  assert.equal((await f.run({email:'wrong'})).status,400);
  assert.equal(f.calls.length,0);
});
test('achat exact accepté et module privé renvoyé sans jeton',async()=>{
  const f=await fixture({responses:[products,{success:true,sales:[sale()]}]});
  const r=await f.run({email:' BUYER@example.com '});
  assert.equal(r.status,200);
  assert.match(r.body.code,/window.PrismPro = P/);
  assert.ok(!JSON.stringify(r.body).includes('test-token'));
  assert.equal(r.headers['Cache-Control'],'no-store');
  assert.equal(f.calls[1].url.searchParams.get('product_id'),'exact-id');
  assert.ok(f.calls[1].options.signal instanceof AbortSignal);
});
test('autre produit et lien contenant le code refusés',async()=>{
  const f=await fixture({responses:[products,{success:true,sales:[
    sale({product_id:'other-id',product_permalink:'tgmmus'}),
    sale({product_id:undefined,product_permalink:'wrong-tgmmus-extra'})
  ]}]});
  assert.equal((await f.run()).body.reason,'notfound');
});
test('lien produit exact accepté quand product_id est absent',async()=>{
  const f=await fixture({responses:[products,{success:true,sales:[sale({product_id:undefined,product_permalink:'https://gumroad.com/l/tgmmus'})]}]});
  assert.equal((await f.run()).status,200);
});
test('pagination : achat valide après un ancien achat remboursé',async()=>{
  const f=await fixture({id:'exact-id',responses:[
    {success:true,sales:[sale({refunded:true})],next_page_key:'cursor-1'},
    {success:true,sales:[sale()]}
  ]});
  assert.equal((await f.run()).status,200);
  assert.equal(f.calls.length,2);
  assert.equal(f.calls[1].url.searchParams.get('page_key'),'cursor-1');
});
test('remboursement et indisponibilité API ont des réponses distinctes',async()=>{
  const a=await fixture({id:'exact-id',responses:[{success:true,sales:[sale({refunded:true})]}]});
  assert.equal((await a.run()).body.reason,'refunded');
  const b=await fixture({responses:[new Error('network')]});
  assert.equal((await b.run()).body.reason,'offline');
});
test('pagination externe refusée sans transmettre le jeton',async()=>{
  const f=await fixture({id:'exact-id',responses:[{success:true,sales:[],next_page_url:'https://untrusted.example/v2/sales?page_key=1'}]});
  assert.equal((await f.run()).body.reason,'offline');
  assert.equal(f.calls.length,1);
});
test('treizième tentative bloquée avec délai de reprise',async()=>{
  const f=await fixture();
  for(let i=0;i<12;i++) assert.equal((await f.run({})).status,400);
  const r=await f.run({});
  assert.equal(r.status,429);
  assert.equal(r.headers['Retry-After'],'600');
});
