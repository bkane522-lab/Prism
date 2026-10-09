// MP4Box.js 2.4.1 (BSD-3-Clause) : https://github.com/gpac/mp4box.js
// Lecture progressive : les images vidéo ne sont pas chargées en entier.
import { createFile } from "./vendor/mp4box/mp4box.all.mjs";

export async function extractMp4Audio(file, onProgress = () => {}) {
  const input = createFile();
  const output = createFile();
  let track, outputId, failure, extracted = 0;
  input.onError = () => { failure = new Error("Structure MP4 illisible."); };
  input.onReady = info => {
    track = info.audioTracks.find(t => t.codec?.startsWith("mp4a"));
    if (!track) { failure = new Error("Cette vidéo ne contient pas de piste AAC compatible. Essaie un fichier audio MP3 ou WAV."); return; }
    if (!track.nb_samples) { failure = new Error("Ce type de MP4 fragmenté n’est pas encore pris en charge."); return; }
    const sourceTrack = input.getTrackById(track.id);
    const descriptions = sourceTrack.mdia.minf.stbl.stsd.entries;
    if (descriptions.length !== 1 || descriptions[0].type !== "mp4a") {
      failure = new Error("Cette piste audio n’est pas prise en charge."); return;
    }
    output.init({ timescale: input.moov.mvhd.timescale, duration: sourceTrack.tkhd.duration, brands: ["M4A ", "isom"] });
    outputId = output.addTrack({
      type: "mp4a", hdlr: "soun", timescale: track.timescale,
      duration: sourceTrack.tkhd.duration, media_duration: sourceTrack.mdia.mdhd.duration,
      channel_count: track.audio.channel_count, samplerate: track.audio.sample_rate,
      samplesize: track.audio.sample_size || 16, language: track.language,
      description_boxes: descriptions[0].boxes
    });
    // Conserve les décalages et l’amorce AAC (edit list), sans ajouter de silence.
    if (sourceTrack.edts) output.getTrackById(outputId).addBox(sourceTrack.edts);
    input.setExtractionOptions(track.id, null, { nbSamples: 100 });
    input.start();
  };
  input.onSamples = (id, user, samples) => {
    if (failure) return;
    for (const sample of samples) {
      output.addSample(outputId, sample.data, {
        duration: sample.duration, dts: sample.dts,
        cts: sample.cts, is_sync: true
      });
      extracted++;
    }
    if (samples.length) input.releaseUsedSamples(id, samples.at(-1).number + 1);
    onProgress(extracted / track.nb_samples);
  };
  const chunkSize = 1024 * 1024;
  let offset = 0, steps = 0;
  try {
    while (offset < file.size && (!track || extracted < track.nb_samples)) {
      if (++steps > Math.ceil(file.size / chunkSize) * 4 + 100) throw new Error("Lecture MP4 interrompue : index de piste incohérent.");
      const end = Math.min(file.size, offset + chunkSize);
      const data = await file.slice(offset, end).arrayBuffer();
      data.fileStart = offset;
      const next = input.appendBuffer(data, end === file.size);
      if (failure) throw failure;
      if (track && extracted >= track.nb_samples) break;
      offset = Number.isFinite(next) && next >= 0 && next !== offset ? next : end;
      // Laisse l’interface afficher la progression sur mobile.
      if (steps % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    input.flush();
    if (failure) throw failure;
    if (!track || !extracted || extracted !== track.nb_samples) throw new Error("La piste audio est absente ou incomplète.");
    onProgress(1);
    return output.getBuffer().buffer;
  } finally {
    input.stop();
  }
}
