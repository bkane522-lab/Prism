import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(){
  const listeners={},deleted=[],assets=[];
  const cache={addAll:async requests=>assets.push(...requests.map(r=>new URL(r.url).pathname)),match:async()=>undefined,put:async()=>{}};
  const context=vm.createContext({URL,Response,Request:class{constructor(url){this.url=new URL(url,'https://prism.example').href}},
    fetch:async()=>new Response('ok'),caches:{open:async()=>cache,keys:async()=>['unrelated-app','prism-v1','prism-v1.0.2'],delete:async key=>deleted.push(key)},
    self:{location:{origin:'https://prism.example'},addEventListener:(n,f)=>listeners[n]=f,skipWaiting:async()=>{},clients:{claim:async()=>{}}}});
  vm.runInContext(code,context);return {listeners,deleted,assets};
}
test('cache limité aux ressources Prism et ménage limité à ses versions',async()=>{
  const w=worker();let pending;
  w.listeners.install({waitUntil:p=>pending=p});await pending;
  assert.ok(w.assets.includes('/vendor/lame.min.js'));assert.ok(w.assets.includes('/icons/icon-192.png'));
  w.listeners.activate({waitUntil:p=>pending=p});await pending;
  assert.deepEqual(w.deleted,['prism-v1']);
});
test('médias distants, médias locaux, API et requêtes POST ignorés',()=>{
  const w=worker();
  for(const [url,method] of [['https://remote.example/song.mp3','GET'],['https://prism.example/media.wav','GET'],['https://prism.example/api/license','GET'],['https://prism.example/index.html','POST']]){
    let handled=false;w.listeners.fetch({request:{url,method},respondWith:()=>handled=true});assert.equal(handled,false,url);
  }
});
