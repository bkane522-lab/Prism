/* =====================================================================
   api/license.js — vérification d'une licence Gumroad.

   Renvoie le code du module Pro (private/pro.js) uniquement quand la
   clé est valide. Aucun secret n'est exposé au navigateur : l'ID du
   produit reste côté serveur, la réponse ne contient que le code Pro
   et l'e-mail de l'acheteur.

   Réponses :
     200 { ok:true, buyer, code }
     400 { ok:false, reason:"invalid" }
     403 { ok:false, reason:"invalid" | "refunded" | "disabled" }
     500 { ok:false, reason:"config" }
     502 { ok:false, reason:"offline" }
===================================================================== */

import fs from "node:fs";
import path from "node:path";

const GUMROAD_VERIFY = "https://api.gumroad.com/v2/licenses/verify";
const PRODUCT_ID = process.env.GUMROAD_PRODUCT_ID;
const MAX_USES = Number(process.env.GUMROAD_MAX_USES || 500);

let cachedCode = null;
function proCode(){
  if(cachedCode) return cachedCode;
  cachedCode = fs.readFileSync(path.join(process.cwd(), "private", "pro.js"), "utf8");
  return cachedCode;
}

function send(res, status, body){
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

export default async function handler(req, res){
  if(req.method !== "POST"){
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok:false, reason:"invalid", error:"Méthode non autorisée." });
  }
  if(!PRODUCT_ID){
    return send(res, 500, { ok:false, reason:"config", error:"GUMROAD_PRODUCT_ID absent." });
  }

  let body = req.body;
  if(typeof body === "string"){
    try{ body = JSON.parse(body); }catch(_){ body = {}; }
  }
  const key = String((body && body.key) || "").trim();
  if(key.length < 8 || key.length > 64){
    return send(res, 400, { ok:false, reason:"invalid", error:"Clé invalide." });
  }

  let data;
  try{
    const r = await fetch(GUMROAD_VERIFY, {
      method:"POST",
      headers:{ "Content-Type":"application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        product_id: PRODUCT_ID,
        license_key: key,
        increment_uses_count: "false"
      })
    });
    data = await r.json();
    if(!r.ok || !data || !data.success){
      return send(res, 403, { ok:false, reason:"invalid", error:"Clé inconnue." });
    }
  }catch(err){
    console.error("Gumroad injoignable:", err);
    return send(res, 502, { ok:false, reason:"offline", error:"Vérification indisponible." });
  }

  const p = data.purchase || {};
  if(p.refunded || p.disputed || p.chargebacked){
    return send(res, 403, { ok:false, reason:"refunded", error:"Achat remboursé." });
  }
  if(p.subscription_id && (p.subscription_cancelled_at || p.subscription_failed_at || p.subscription_ended_at)){
    return send(res, 403, { ok:false, reason:"disabled", error:"Abonnement terminé." });
  }
  if(p.disabled === true){
    return send(res, 403, { ok:false, reason:"disabled", error:"Licence désactivée." });
  }
  if(typeof data.uses === "number" && data.uses > MAX_USES){
    return send(res, 403, { ok:false, reason:"disabled", error:"Trop d'activations." });
  }

  let code;
  try{
    code = proCode();
  }catch(err){
    console.error("Module Pro illisible:", err);
    return send(res, 500, { ok:false, reason:"config", error:"Module Pro introuvable." });
  }

  return send(res, 200, { ok:true, buyer: p.email || null, code });
}
