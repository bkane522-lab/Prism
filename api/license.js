/* Vérification Gumroad par e-mail. Le jeton reste exclusivement côté serveur.
   L'e-mail confirme un achat, pas l'identité de la personne qui le saisit. */
import fs from "node:fs";

const API = "https://api.gumroad.com/v2";
const TOKEN = process.env.GUMROAD_ACCESS_TOKEN;
const PERMALINK = (process.env.GUMROAD_PRODUCT_PERMALINK || "").trim();
const CONFIGURED_ID = (process.env.GUMROAD_PRODUCT_ID || "").trim();
let cachedProductId = CONFIGURED_ID || null;
let cachedCode = null;
function proCode(){
  if(!cachedCode) cachedCode = fs.readFileSync(new URL("../private/pro.js", import.meta.url), "utf8");
  return cachedCode;
}
function permalink(value){
  const raw = String(value || "").trim();
  try{ return new URL(raw).pathname.replace(/\/$/, "").split("/").pop(); }
  catch{ return raw; }
}
async function gumroad(resource, params, signal){
  const url = new URL(`${API}/${resource}`);
  url.searchParams.set("access_token", TOKEN);
  for(const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
  const response = await fetch(url, { signal });
  const data = await response.json();
  if(!response.ok || !data.success) throw new Error("Gumroad indisponible");
  return data;
}
async function productId(signal){
  if(cachedProductId) return cachedProductId;
  const data = await gumroad("products", {}, signal);
  if(!Array.isArray(data.products)) throw new Error("Réponse produits invalide");
  const match = data.products.find(p =>
    p.custom_permalink === PERMALINK || permalink(p.short_url) === PERMALINK
  );
  if(!match || !match.id) throw new Error("Produit introuvable");
  cachedProductId = String(match.id);
  return cachedProductId;
}
const hits = new Map();
function tooMany(ip){
  const now = Date.now(), win = 10 * 60 * 1000;
  for(const [key, entry] of hits){ if(now - entry.at >= win) hits.delete(key); }
  let entry = hits.get(ip);
  if(!entry){
    // Une instance à capacité pleine refuse au lieu d'effacer ses limites.
    if(hits.size >= 2000) return true;
    entry = { at:now, count:0 }; hits.set(ip, entry);
  }
  return ++entry.count > 12;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isRefunded = s => s.refunded === true || s.disputed === true ||
  s.chargedback === true || s.chargebacked === true;
function send(res, status, body){
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}
function nextPage(data){
  if(data.next_page_key) return String(data.next_page_key);
  if(!data.next_page_url) return null;
  const url = new URL(data.next_page_url, `${API}/sales`);
  if(url.origin !== "https://api.gumroad.com" || url.pathname !== "/v2/sales"){
    throw new Error("Pagination invalide");
  }
  const key = url.searchParams.get("page_key");
  if(!key) throw new Error("Curseur absent");
  return key;
}
export default async function handler(req, res){
  if(req.method !== "POST"){
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok:false, reason:"invalid" });
  }
  if(!TOKEN || (!PERMALINK && !CONFIGURED_ID)) return send(res, 500, { ok:false, reason:"config" });
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "inconnu").split(",")[0].trim();
  if(tooMany(ip)){
    res.setHeader("Retry-After", "600");
    return send(res, 429, { ok:false, reason:"toomany" });
  }
  let body = req.body;
  if(typeof body === "string"){
    try{ body = JSON.parse(body); }catch{ body = {}; }
  }
  const email = String(body?.email || "").trim().toLowerCase();
  if(!EMAIL_RE.test(email) || email.length > 160) return send(res, 400, { ok:false, reason:"invalid" });
  let found = false, valid = null;
  try{
    const signal = AbortSignal.timeout(12000);
    const pid = await productId(signal);
    let key = null;
    const seen = new Set();
    for(let page = 0; page < 25; page++){
      const data = await gumroad("sales", {
        product_id:pid, email, ...(key ? { page_key:key } : {})
      }, signal);
      if(!Array.isArray(data.sales)) throw new Error("Réponse ventes invalide");
      const mine = data.sales.filter(s => {
        const e = String(s.email || s.purchase_email || "").trim().toLowerCase();
        // Si l'identifiant est présent, aucune comparaison approximative du lien.
        const productMatches = s.product_id != null
          ? String(s.product_id) === pid
          : !!PERMALINK && permalink(s.product_permalink) === PERMALINK;
        return e === email && productMatches;
      });
      found ||= mine.length > 0;
      valid = mine.find(s => !isRefunded(s));
      if(valid) break;
      key = nextPage(data);
      if(!key) break;
      if(seen.has(key) || page === 24) throw new Error("Pagination incomplète");
      seen.add(key);
    }
  }catch{
    // Ne pas journaliser le jeton, l'e-mail ou les réponses des ventes.
    return send(res, 502, { ok:false, reason:"offline" });
  }
  if(!found) return send(res, 403, { ok:false, reason:"notfound" });
  if(!valid) return send(res, 403, { ok:false, reason:"refunded" });
  try{
    return send(res, 200, { ok:true, buyer:email, code:proCode() });
  }catch{
    return send(res, 500, { ok:false, reason:"config" });
  }
}
