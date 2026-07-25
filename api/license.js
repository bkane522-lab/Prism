/* =====================================================================
   api/license.js — vérification d'achat Gumroad par adresse e-mail.

   Pourquoi l'e-mail et pas une clé de licence : Gumroad n'expose pas
   toujours l'option « clé de licence par vente ». La vérification par
   e-mail utilise l'API des ventes, qui fonctionne dans tous les cas.

   Le jeton d'accès Gumroad reste côté serveur : il n'est jamais envoyé
   au navigateur. La réponse ne contient que le code du module Pro.

   Réponses :
     200 { ok:true,  buyer, code }
     400 { ok:false, reason:"invalid" }     e-mail mal formé
     403 { ok:false, reason:"notfound" }    aucun achat pour cet e-mail
     403 { ok:false, reason:"refunded" }    achat remboursé ou contesté
     429 { ok:false, reason:"toomany" }     trop de tentatives
     500 { ok:false, reason:"config" }      variables d'environnement absentes
     502 { ok:false, reason:"offline" }     Gumroad injoignable
===================================================================== */

import fs from "node:fs";
import path from "node:path";

const API = "https://api.gumroad.com/v2";
const TOKEN = process.env.GUMROAD_ACCESS_TOKEN;
const PERMALINK = (process.env.GUMROAD_PRODUCT_PERMALINK || "").trim();

/* --- Module Pro, lu une seule fois puis gardé en mémoire --- */
let cachedCode = null;
function proCode(){
  if(cachedCode) return cachedCode;
  cachedCode = fs.readFileSync(path.join(process.cwd(), "private", "pro.js"), "utf8");
  return cachedCode;
}

/* --- Identifiant du produit, résolu depuis le permalien --- */
let cachedProductId = null;
async function productId(){
  if(cachedProductId) return cachedProductId;
  const r = await fetch(`${API}/products?access_token=${encodeURIComponent(TOKEN)}`);
  const data = await r.json();
  if(!r.ok || !data.success || !Array.isArray(data.products)){
    throw new Error("Liste des produits indisponible");
  }
  const match = data.products.find(p =>
    p.custom_permalink === PERMALINK ||
    p.short_url === PERMALINK ||
    (typeof p.short_url === "string" && p.short_url.endsWith("/" + PERMALINK))
  );
  if(!match) throw new Error(`Produit "${PERMALINK}" introuvable`);
  cachedProductId = match.id;
  return cachedProductId;
}

/* --- Garde-fou anti-force brute, à l'échelle d'une instance --- */
const hits = new Map();
function tooMany(ip){
  const now = Date.now();
  const win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now);
  hits.set(ip, list);
  if(hits.size > 500) hits.clear();
  return list.length > 12;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isRefunded = s =>
  s.refunded === true || s.disputed === true ||
  s.chargedback === true || s.chargebacked === true;

function send(res, status, body){
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

export default async function handler(req, res){
  if(req.method !== "POST"){
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok:false, reason:"invalid" });
  }
  if(!TOKEN || !PERMALINK){
    return send(res, 500, { ok:false, reason:"config" });
  }

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "inconnu";
  if(tooMany(ip)){
    return send(res, 429, { ok:false, reason:"toomany" });
  }

  let body = req.body;
  if(typeof body === "string"){
    try{ body = JSON.parse(body); }catch(_){ body = {}; }
  }
  const email = String((body && body.email) || "").trim().toLowerCase();
  if(!EMAIL_RE.test(email) || email.length > 160){
    return send(res, 400, { ok:false, reason:"invalid" });
  }

  let sales;
  try{
    const pid = await productId();
    const url = `${API}/sales?access_token=${encodeURIComponent(TOKEN)}`
      + `&product_id=${encodeURIComponent(pid)}`
      + `&email=${encodeURIComponent(email)}`;
    const r = await fetch(url);
    const data = await r.json();
    if(!r.ok || !data.success){
      console.error("Gumroad /sales:", r.status, data && data.message);
      return send(res, 502, { ok:false, reason:"offline" });
    }
    sales = Array.isArray(data.sales) ? data.sales : [];
  }catch(err){
    console.error("Gumroad injoignable:", err.message);
    return send(res, 502, { ok:false, reason:"offline" });
  }

  // On revérifie l'adresse et le produit côté serveur : le filtre de
  // l'API ne dispense pas de contrôler ce qui revient réellement.
  const mine = sales.filter(s => {
    const e = String(s.email || s.purchase_email || "").trim().toLowerCase();
    const link = String(s.product_permalink || "");
    return e === email && (link === PERMALINK || link.endsWith("/" + PERMALINK) || link.includes(PERMALINK));
  });

  if(!mine.length){
    return send(res, 403, { ok:false, reason:"notfound" });
  }
  const valid = mine.find(s => !isRefunded(s));
  if(!valid){
    return send(res, 403, { ok:false, reason:"refunded" });
  }

  let code;
  try{
    code = proCode();
  }catch(err){
    console.error("Module Pro illisible:", err.message);
    return send(res, 500, { ok:false, reason:"config" });
  }

  return send(res, 200, { ok:true, buyer: valid.email || email, code });
}
