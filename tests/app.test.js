import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const pro=fs.readFileSync(new URL('../private/pro.js',import.meta.url),'utf8');
const lame=fs.readFileSync(new URL('../public/vendor/lame.min.js',import.meta.url),'utf8');
function app(stored={},fetchImpl=async()=>{throw Error("Pas de réseau pendant ces tests");}){
  const els=new Map(), classes=new Map(), swCalls=[], timers=[];
  function el(id){
    if(els.has(id))return els.get(id);
    const set=new Set();classes.set(id,set);
    const e={id,value:'0',disabled:false,style:{},dataset:{},attrs:{},listeners:{},children:[],clientWidth:400,
      classList:{add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x),toggle:(x,b)=>{b??=!set.has(x);b?set.add(x):set.delete(x);}},
      addEventListener:(name,fn)=>e.listeners[name]=fn,setAttribute:(k,v)=>{e.attrs[k]=v},getAttribute:k=>e.attrs[k],removeAttribute:k=>delete e.attrs[k],
      appendChild:x=>{e.children.push(x)},append:(...x)=>e.children.push(...x),closest:selector=>selector==='.pro-zone'&&e.pro?el('zoneFx'):null,
      scrollIntoView:()=>{},click:()=>e.listeners.click?.({target:e}),getContext:()=>({createLinearGradient:()=>({addColorStop(){}}),setTransform(){},clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}})};
    els.set(id,e);return e;
  }
  for(const match of html.matchAll(/id="([^"]+)"/g))el(match[1]);
  el('stage').classList.add('hidden');el('end').value='1000';el('kbps').value='192';el('file').attrs.accept='audio/*';el('norm').attrs['aria-pressed']='false';
  for(const id of ['fadeIn','fadeOut','norm','addMark','exportAll'])el(id).pro=true;
  const formats=['mp3','wav','m4a'].map(fmt=>{const e=el(fmt==='m4a'?'btnM4a':fmt);e.dataset.fmt=fmt;return e;});
  const controls=['play','start','end','fadeIn','fadeOut','norm','kbps','sr','ch','go','addMark','exportAll'].map(el).concat(formats);
  const document={getElementById:el,head:{appendChild:s=>timers.push(()=>s.onload?.())},createElement:tag=>el(`new-${tag}-${els.size}`),dispatchEvent(){},
    querySelector:selector=>selector.includes('data-fmt="mp3"')?formats[0]:null,
    querySelectorAll:selector=>selector==='.pro-zone'?[el('zoneFx'),el('zoneMarks')]:selector.includes('#stage')?controls:selector.includes('#fmt')?formats:[]};
  const storage=new Map(Object.entries(stored));
  const ctx=vm.createContext({document,console:{...console,error(){}},Blob,URL,TextEncoder,DataView,Uint8Array,Uint32Array,Int16Array,Float32Array,ArrayBuffer,AbortSignal,
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    navigator:{onLine:true,serviceWorker:{register:async url=>{swCalls.push(url);return {};}}},
    MediaRecorder:{isTypeSupported:()=>true},CustomEvent:class{},
    setInterval:()=>1,clearInterval(){},setTimeout:fn=>{timers.push(fn);return 1},clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    fetch:fetchImpl,addEventListener(){},devicePixelRatio:1});
  ctx.window=ctx;
  vm.runInContext(script,ctx);
  return {ctx,el,storage,swCalls,timers,run:code=>vm.runInContext(code,ctx),loadLame(){vm.runInContext(lame,ctx);timers.shift()();}};
}
function buffer(ch=2,rate=44100,seconds=.1){
  const n=Math.round(rate*seconds),channels=Array.from({length:ch},()=>Float32Array.from({length:n},(_,i)=>.4*Math.sin(i*2*Math.PI*440/rate)));
  return {numberOfChannels:ch,length:n,sampleRate:rate,duration:seconds,getChannelData:c=>channels[c]};
}
test('démarrage gratuit et restauration Pro sans erreur d’initialisation',()=>{
  const free=app();assert.equal(free.run('state.pro'),false);assert.equal(free.el('fadeIn').disabled,true);
  const restored=app({'prism.lic.email':'buyer@example.com','prism.lic.code':pro,'prism.lic.at':String(Date.now())});
  assert.equal(restored.run('state.pro'),true);
  assert.deepEqual(restored.swCalls,['/sw.js']);
  assert.equal(restored.el('fadeIn').disabled,false);
});
test('verrouillage des réglages, imports et licence pendant un export',()=>{
  const a=app();a.run('setBusy(true)');
  for(const id of ['go','exportAll','start','end','sr','ch','file','fetchBtn','licOff','btnM4a'])assert.equal(a.el(id).disabled,true,id);
  assert.equal(a.el('drop').attrs['aria-disabled'],'true');
  a.run('setBusy(false)');assert.equal(a.el('go').disabled,false);assert.equal(a.el('fadeIn').disabled,true);
});
test('retrait Pro remet un format gratuit et masque l’installation',()=>{
  const a=app({'prism.lic.email':'buyer@example.com','prism.lic.code':pro,'prism.lic.at':String(Date.now())});
  a.run('state.format="m4a"; installEvent={};setPro(true);');a.el('licOff').click();
  assert.equal(a.run('state.pro'),false);assert.equal(a.run('state.format'),'wav');
  assert.equal(a.el('installBtn').classList.contains('hidden'),true);assert.equal(a.storage.size,0);
});
test('échec du premier import visible et ancien fichier préservé après échec',async()=>{
  const a=app();a.ctx.AudioContext=class{async decodeAudioData(){throw Error('codec refusé');}};
  await a.ctx.load({name:'bad.bin',arrayBuffer:async()=>new ArrayBuffer(2)});
  assert.match(a.el('importNote').textContent,/pas pu être décodé/);
  assert.equal(a.run('state.busy'),false);
  a.run('state.name="ancien"');
  await a.ctx.load({name:'nouveau.bin',arrayBuffer:async()=>new ArrayBuffer(2)});
  assert.equal(a.run('state.name'),'ancien');
});
test('WAV produit un vrai fichier PCM lisible avec ffprobe',async()=>{
  const a=app();a.ctx.testBuffer=buffer(1,16000);
  const blob=a.run('toWav(testBuffer)');
  const bytes=Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.readUInt32LE(24),16000);assert.equal(bytes.readUInt16LE(22),1);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prism-wav-'));
  try{
    const file=path.join(dir,'test.wav');fs.writeFileSync(file,bytes);
    const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_name,sample_rate,channels','-of','json',file],{encoding:'utf8'});
    assert.equal(probe.status,0);const stream=JSON.parse(probe.stdout).streams[0];assert.equal(stream.codec_name,'pcm_s16le');assert.equal(stream.sample_rate,'16000');assert.equal(stream.channels,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('encodeur MP3 intégré produit un fichier mono et stéréo lisible',async()=>{
  const a=app();a.loadLame();assert.equal(a.run('mp3Ready'),true);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prism-mp3-'));
  try{
    for(const ch of [1,2]){
      a.ctx.testBuffer=buffer(ch,44100,.3);
      // L’encodage cède au navigateur ; le test exécute ces pauses immédiatement.
      a.ctx.setTimeout=fn=>{fn();return 1};
      const blob=await a.run('toMp3(testBuffer,192)');
      const file=path.join(dir,`${ch}.mp3`);fs.writeFileSync(file,Buffer.from(await blob.arrayBuffer()));
      const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_name,sample_rate,channels','-of','json',file],{encoding:'utf8'});
      assert.equal(probe.status,0,probe.stderr);const stream=JSON.parse(probe.stdout).streams[0];assert.equal(stream.codec_name,'mp3');assert.equal(stream.channels,ch);assert.equal(stream.sample_rate,'44100');
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('fondus et normalisation Pro modifient le signal ; ZIP intègre les noms UTF-8',async()=>{
  const a=app();vm.runInContext(pro,a.ctx);const b=buffer(1,16000);
  a.ctx.PrismPro.processBuffer(b,{normalize:true,fadeIn:.02,fadeOut:.02});
  assert.equal(b.getChannelData(0)[0],0);assert.equal(Math.abs(b.getChannelData(0).at(-1)),0);
  const peak=Math.max(...b.getChannelData(0).map(Math.abs));assert.ok(Math.abs(peak-Math.pow(10,-1/20))<.01);
  const blob=a.ctx.PrismPro.zip([{name:'extrait-é.wav',data:new Uint8Array([1,2,3])},{name:'second.wav',data:new Uint8Array([4,5])}]);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prism-zip-'));
  try{
    const file=path.join(dir,'test.zip');fs.writeFileSync(file,Buffer.from(await blob.arrayBuffer()));
    const check=spawnSync('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.read("extrait-é.wav") == bytes([1,2,3]); assert len(z.namelist()) == 2',file],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('revérification refusée retire le Pro et un retrait manuel ignore les anciennes réponses',async()=>{
  const old={'prism.lic.email':'buyer@example.com','prism.lic.code':pro,'prism.lic.at':'0'};
  const a=app(old,async()=>({status:403,json:async()=>({ok:false,reason:'refunded'})}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(a.run('state.pro'),false);assert.equal(a.storage.size,0);
  let release;
  const b=app(old,()=>new Promise(resolve=>release=resolve));
  b.el('licOff').click();
  release({status:200,json:async()=>({ok:true,code:pro,buyer:'buyer@example.com'})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(b.run('state.pro'),false);assert.equal(b.storage.size,0);
});
