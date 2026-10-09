import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {extractMp4Audio} from '../public/mp4-audio.js';
function run(args){const r=spawnSync('ffmpeg',['-v','error',...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
async function source(file){
  const fd=await fs.open(file),{size}=await fd.stat();const reads=[];
  return {reads,close:()=>fd.close(),size,
    arrayBuffer(){assert.fail('La vidéo entière ne doit pas être chargée');},
    slice:(start,end)=>({arrayBuffer:async()=>{
      assert.ok(end-start<=1024*1024);reads.push([start,end]);
      const data=Buffer.alloc(end-start);const {bytesRead}=await fd.read(data,0,data.length,start);
      return data.buffer.slice(data.byteOffset,data.byteOffset+bytesRead);
    }})};
}
test('MP4 avec moov au début ou à la fin : audio identique, lecture limitée à 1 Mo',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'prism-mp4-'));
  try{
    for(const fast of [false,true]){
      const original=path.join(dir,`${fast}.mp4`),audio=path.join(dir,`${fast}.m4a`);
      run(['-f','lavfi','-i','color=c=blue:s=320x240:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-c:a','aac','-ac','2','-ar','48000',...(fast?['-movflags','+faststart']:[]),'-shortest',original]);
      const src=await source(original);const progress=[];
      try{const buffer=await extractMp4Audio(src,p=>progress.push(p));await fs.writeFile(audio,new Uint8Array(buffer));}finally{await src.close();}
      assert.equal(progress.at(-1),1);assert.ok(src.reads.length>=1);
      const stream=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,sample_rate,channels','-of','json',audio],{encoding:'utf8'});
      assert.equal(stream.status,0,stream.stderr);const info=JSON.parse(stream.stdout).streams;
      assert.equal(info.length,1);assert.equal(info[0].codec_type,'audio');assert.equal(info[0].sample_rate,'48000');
      const hash=file=>run(['-i',file,'-map','0:a:0','-f','hash','-hash','sha256','-']);
      assert.equal(hash(original),hash(audio),'Le signal audio décodé doit rester identique');
    }
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('MP4 sans audio : erreur claire sans chargement complet',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'prism-no-audio-'));
  const file=path.join(dir,'silent.mp4');
  try{
    run(['-f','lavfi','-i','color=c=blue:s=320x240:d=1','-c:v','libx264',file]);
    const src=await source(file);try{await assert.rejects(extractMp4Audio(src),/piste AAC compatible/);}finally{await src.close();}
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('contenu invalide : rejet au lieu d’un chargement sans fin',async()=>{
  const bad=new Blob([new Uint8Array(64)]);
  await assert.rejects(extractMp4Audio(bad),/MP4 illisible|absente ou incomplète/);
});
