/* =====================================================================
   private/pro.js — module Prism Pro
   Ce fichier n'est JAMAIS servi en statique. Il est renvoyé par
   /api/license uniquement après vérification d'une clé Gumroad valide,
   puis exécuté dans la page via new Function(code).
   Ne rien mettre ici qui doive rester secret côté serveur : le code
   arrive dans le navigateur de l'acheteur, comme n'importe quel script.
===================================================================== */
(function(){
  "use strict";

  const P = {};
  P.version = "1.0.0";

  /* -------------------------------------------------------------
     Fondus d'entrée et de sortie (courbe douce, sans clic)
  ------------------------------------------------------------- */
  P.applyFades = function(buffer, fadeIn, fadeOut){
    const rate = buffer.sampleRate;
    const maxHalf = Math.floor(buffer.length / 2);
    const nIn = Math.min(maxHalf, Math.round((fadeIn || 0) * rate));
    const nOut = Math.min(maxHalf, Math.round((fadeOut || 0) * rate));
    if(nIn <= 0 && nOut <= 0) return buffer;

    for(let c = 0; c < buffer.numberOfChannels; c++){
      const d = buffer.getChannelData(c);
      for(let i = 0; i < nIn; i++){
        const t = i / nIn;
        d[i] *= t * t * (3 - 2 * t);
      }
      for(let i = 0; i < nOut; i++){
        const t = i / nOut;
        d[d.length - 1 - i] *= t * t * (3 - 2 * t);
      }
    }
    return buffer;
  };

  /* -------------------------------------------------------------
     Normalisation crête, cible -1 dBFS
  ------------------------------------------------------------- */
  P.normalize = function(buffer, targetDb){
    const target = Math.pow(10, (typeof targetDb === "number" ? targetDb : -1) / 20);
    let peak = 0;
    for(let c = 0; c < buffer.numberOfChannels; c++){
      const d = buffer.getChannelData(c);
      for(let i = 0; i < d.length; i++){
        const v = d[i] < 0 ? -d[i] : d[i];
        if(v > peak) peak = v;
      }
    }
    if(peak === 0) return buffer;
    const gain = target / peak;
    if(Math.abs(gain - 1) < 0.001) return buffer;
    for(let c = 0; c < buffer.numberOfChannels; c++){
      const d = buffer.getChannelData(c);
      for(let i = 0; i < d.length; i++) d[i] *= gain;
    }
    return buffer;
  };

  /* Chaîne appelée par l'application : normaliser puis fondre */
  P.processBuffer = function(buffer, opts){
    opts = opts || {};
    if(opts.normalize) P.normalize(buffer, -1);
    if(opts.fadeIn > 0 || opts.fadeOut > 0) P.applyFades(buffer, opts.fadeIn, opts.fadeOut);
    return buffer;
  };

  /* -------------------------------------------------------------
     Encodage MP4/M4A via MediaRecorder.
     L'encodage se fait en temps réel : une minute d'audio prend
     une minute. Disponible seulement si le navigateur sait écrire
     de l'audio/mp4 (Safari, Chrome récent sur Android).
  ------------------------------------------------------------- */
  P.encodeM4A = function(buffer, opts){
    opts = opts || {};
    const mime = opts.mime || "audio/mp4";
    return new Promise(function(resolve, reject){
      if(typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported(mime)){
        reject(new Error("Ce navigateur n'encode pas le MP4 audio. Choisis MP3 ou WAV."));
        return;
      }
      let ctx;
      try{
        ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: buffer.sampleRate });
      }catch(_){
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const dest = ctx.createMediaStreamDestination();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(dest);

      let rec;
      try{
        rec = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: opts.bitrate || 192000 });
      }catch(err){
        ctx.close();
        reject(new Error("Encodage MP4 refusé par le navigateur."));
        return;
      }

      const chunks = [];
      let timer = 0;
      const t0 = ctx.currentTime;

      rec.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = () => {
        clearInterval(timer);
        ctx.close();
        reject(new Error("L'encodage MP4 a échoué."));
      };
      rec.onstop = () => {
        clearInterval(timer);
        ctx.close();
        resolve(new Blob(chunks, { type: mime.split(";")[0] }));
      };

      if(opts.onProgress){
        timer = setInterval(() => {
          opts.onProgress(Math.min(0.99, (ctx.currentTime - t0) / buffer.duration));
        }, 250);
      }

      src.onended = () => setTimeout(() => { if(rec.state !== "inactive") rec.stop(); }, 200);
      rec.start();
      src.start();
      ctx.resume();
    });
  };

  /* -------------------------------------------------------------
     Archive ZIP (méthode « stored » : l'audio est déjà compressé)
  ------------------------------------------------------------- */
  const CRC_TABLE = (function(){
    const t = new Uint32Array(256);
    for(let n = 0; n < 256; n++){
      let c = n;
      for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes){
    let c = 0xFFFFFFFF;
    for(let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosStamp(d){
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2)),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  P.zip = function(files){
    const enc = new TextEncoder();
    const stamp = dosStamp(new Date());
    const local = [], central = [];
    let offset = 0;

    files.forEach(function(f){
      const nameBytes = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const size = data.length;

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);   // noms en UTF-8
      lh.setUint16(8, 0, true);        // stored
      lh.setUint16(10, stamp.time, true);
      lh.setUint16(12, stamp.date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true);
      lh.setUint32(22, size, true);
      lh.setUint16(26, nameBytes.length, true);
      lh.setUint16(28, 0, true);
      local.push(new Uint8Array(lh.buffer), nameBytes, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, stamp.time, true);
      ch.setUint16(14, stamp.date, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true);
      ch.setUint32(24, size, true);
      ch.setUint16(28, nameBytes.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameBytes);

      offset += 30 + nameBytes.length + size;
    });

    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, files.length, true);
    eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, offset, true);

    return new Blob(local.concat(central, [new Uint8Array(eocd.buffer)]), { type: "application/zip" });
  };

  window.PrismPro = P;
  document.dispatchEvent(new CustomEvent("prism:pro-ready"));
})();
