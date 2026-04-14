const express = require("express");
const { Redis } = require("@upstash/redis");
const QRCode   = require("qrcode");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Credenciais ───────────────────────────────────────────────
const redis = new Redis({
  url:   "https://gorgeous-warthog-98319.upstash.io",
  token: "gQAAAAAAAYAPAAIncDIwNjA2ZjEyZDUwZGQ0YTJmOGEyOWExMzk5ODIwOTI4MnAyOTgzMTk",
});
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : process.env.BASE_URL || "https://whatauto-bot-production.up.railway.app";

console.log("✅ JustHelp Bot iniciando | BASE_URL:", BASE_URL);

// ── Pix ───────────────────────────────────────────────────────
function pf(id, v) { return `${id}${String(v.length).padStart(2,"0")}${v}`; }
function pcrc(s) {
  let c = 0xFFFF;
  for (let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021):(c<<1);}
  return (c&0xFFFF).toString(16).toUpperCase().padStart(4,"0");
}
function pixPayload(valor) {
  const ma = pf("00","BR.GOV.BCB.PIX")+pf("01","justhelpadv@gmail.com");
  const ad = pf("05","JUSTHELPADV");
  const p  = pf("00","01")+pf("01","12")+pf("26",ma)+pf("52","0000")+pf("53","986")
           + pf("54",Number(valor).toFixed(2))+pf("58","BR")+pf("59","JustHelp Adv")
           + pf("60","Sao Paulo")+pf("62",ad)+"6304";
  return p+pcrc(p);
}
async function paginaPix(valor) {
  const code = pixPayload(valor);
  const qr   = await QRCode.toDataURL(code, { width:260, margin:2 });
  const label = valor==50 ? "Diagnóstico de CPF" : "Entrada — Restauração de Crédito";
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pagar R$ ${Number(valor).toFixed(2).replace(".",",")} — JustHelp</title>
<style>*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;border-radius:20px;padding:28px 22px;max-width:360px;width:100%;text-align:center}
.logo{background:#1D7874;color:#fff;border-radius:10px;padding:8px 18px;display:inline-block;font-weight:700;font-size:17px;margin-bottom:16px}
.valor{font-size:36px;font-weight:700;color:#1D7874;margin-bottom:2px}
.sub{color:#888;font-size:13px;margin-bottom:20px}
.qr{background:#f8f9fa;border-radius:14px;padding:14px;display:inline-block;margin-bottom:18px}
.qr img{display:block;width:230px;height:230px}
.steps{text-align:left;margin-bottom:16px}
.step{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#444}
.step:last-child{border:none}
.n{background:#1D7874;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px}
.copia{background:#f8f9fa;border-radius:10px;padding:10px;font-family:monospace;font-size:10px;color:#333;word-break:break-all;margin-bottom:10px;text-align:left;line-height:1.5}
.btn{width:100%;padding:14px;border-radius:10px;border:none;font-size:15px;font-weight:700;cursor:pointer;background:#1D7874;color:#fff}
.ok{background:#22c55e}
.aviso{font-size:11px;color:#aaa;margin-top:14px}</style></head>
<body><div class="card">
<div class="logo">JustHelp</div>
<div class="valor">R$ ${Number(valor).toFixed(2).replace(".",",")}</div>
<div class="sub">${label}</div>
<div class="qr"><img src="${qr}" alt="QR Code Pix"></div>
<div class="steps">
<div class="step"><span class="n">1</span><span>Abra seu banco ou app</span></div>
<div class="step"><span class="n">2</span><span>Pix → <strong>QR Code</strong> ou <strong>Copia e Cola</strong></span></div>
<div class="step"><span class="n">3</span><span>Escaneie ou cole o código abaixo</span></div>
</div>
<div class="copia" id="cod">${code}</div>
<button class="btn" id="btn" onclick="copy()">📋 Copiar código Pix</button>
<div class="aviso">⚠️ Após pagar, envie o comprovante no WhatsApp.</div>
</div>
<script>function copy(){navigator.clipboard.writeText(document.getElementById('cod').textContent).then(()=>{const b=document.getElementById('btn');b.textContent='✅ Copiado!';b.classList.add('ok');setTimeout(()=>{b.textContent='📋 Copiar código Pix';b.classList.remove('ok')},3000)})}</script>
</body></html>`;
}

// ── Estado ────────────────────────────────────────────────────
async function get(id)    { try{return(await redis.get(`c:${id}`))||novo();}catch{return novo();} }
async function save(id,c) { try{await redis.set(`c:${id}`,c);}catch(e){console.error("redis:",e.message);} }
function novo() { return { etapa:0, nome:"", dados:"", modoHumano:false }; }

function getId(body) {
  const phone  = (body.phone  ||"").toString().trim();
  const sender = (body.sender ||"").toString().trim();
  if (phone  && phone  !=="WhatsAuto app" && /\d/.test(phone))  return phone;
  if (sender && sender !=="WhatsAuto app" && sender !=="") return sender;
  return "teste";
}
function nome(t) {
  return t.trim().split(" ").map(p=>p.charAt(0).toUpperCase()+p.slice(1).toLowerCase()).join(" ");
}
function isOi(msg) {
  return /^(oi|ol[aá]|oii+|bom dia|boa tarde|boa noite|hello|hi|opa|salve|al[oô]|inicio|start|menu|começar|comecar)[\s!?.]*$/i.test(msg.trim());
}
function isComprovante(msg) {
  if (!msg||msg.trim()==="") return true;
  return /paguei|pago|fiz|transferi|enviado|efetuado|feito|realizei|pronto|segue|comprovante|print|t[aá] aqui/i.test(msg);
}

// ─────────────────────────────────────────────────────────────
//  MENUS
// ─────────────────────────────────────────────────────────────
const M = {
  inicio: () =>
    `Olá! 😊 Me fala seu *nome* pra começar.`,

  menu_principal: (n) =>
    `Oi, *${n}*! O que você precisa?\n\n1️⃣ Limpar meu nome\n2️⃣ Entender como funciona`,

  como_funciona: () =>
    `Fazemos *análise jurídica* das dívidas — identificamos irregularidades e pedimos a remoção das restrições. Não renegociamos.\n\n1️⃣ Quero fazer diagnóstico do CPF\n2️⃣ Voltar`,

  onde_restricoes: () =>
    `Onde estão suas restrições?\n\n1️⃣ Serasa\n2️⃣ SPC\n3️⃣ Banco\n4️⃣ Cartório\n5️⃣ Não sei`,

  ja_tentou: () =>
    `Já tentou resolver antes?\n\n1️⃣ Sim\n2️⃣ Não`,

  posicionamento: (n) =>
    `${n}, diferente de renegociação, nosso trabalho é jurídico — encontramos erros na dívida pra pedir remoção. ⚖️\n\nPrimeiro passo: *diagnóstico do CPF por R$ 50* (abatido se seguir).\n\n1️⃣ Quero o diagnóstico\n2️⃣ Dúvida sobre o valor\n3️⃣ Preciso pensar`,

  obj_valor: () =>
    `R$ 50 é menos que uma consulta médica. Se não tiver viabilidade, você sabe antes de gastar mais. E é abatido se seguir.\n\n1️⃣ Vamos lá\n2️⃣ Ainda tenho dúvidas`,

  obj_pensar: () =>
    `O que está travando?\n\n1️⃣ Não sei se é confiável\n2️⃣ Não tenho o valor agora\n3️⃣ Quero entender melhor\n4️⃣ Volto depois`,

  obj_confiavel: () =>
    `Somos escritório jurídico registrado. O diagnóstico de R$ 50 é justamente pra você ver a viabilidade antes de investir mais.\n\n1️⃣ Ok, vou fazer\n2️⃣ Quero falar com especialista`,

  obj_sem_dinheiro: () =>
    `Sem problema! Quando estiver pronto, manda *Oi* que retomamos. 😊\n\n1️⃣ Consigo sim, vamos lá\n2️⃣ Volto depois`,

  coletar_dados: () =>
    `Ótimo! Me envia seu *nome completo* e *CPF*. 📋`,

  enviar_pix50: (url) =>
    `💳 *R$ 50*\n👇 Pague aqui (QR Code + Copia e Cola):\n${url}\n\nMe envia o comprovante depois. 📸`,

  confirmar_pix50: (n) =>
    `✅ Comprovante recebido, ${n}!\n\nJá estou iniciando a análise do seu CPF. Em breve um dos nossos especialistas vai te enviar o resultado completo aqui. 🔍\n\nAguarda! 😊`,

  oferta_servico: (n) =>
    `${n}, para liberar seu nome:\n\n▶ *Entrada:* R$ 250\n▶ *Êxito:* R$ 450 _(só após resultado)_\n▶ R$ 50 já abatidos!\n\nSe não funcionar, *não paga o êxito*.\n\n1️⃣ Quero entrar\n2️⃣ Valor alto pra mim\n3️⃣ E se não funcionar?\n4️⃣ Quanto tempo demora?`,

  obj_caro: () =>
    `Nome limpo = cartão, financiamento, crédito. Vale muito mais que R$ 250. E os R$ 450 só pagam com resultado.\n\n1️⃣ Faz sentido, vou entrar\n2️⃣ Não tenho agora`,

  obj_e_se_falhar: () =>
    `Os R$ 450 são pagos *só se funcionar*. Se não funcionar, não paga. Simples assim. 💪\n\n1️⃣ Entendi, quero entrar\n2️⃣ Ainda tenho dúvida`,

  obj_tempo: () =>
    `30 a 90 dias na maioria dos casos. Casos simples, menos de 30. ⏱️\n\n1️⃣ Ótimo, vamos\n2️⃣ Preciso pensar`,

  enviar_pix250: (url) =>
    `💳 *Entrada R$ 250*\n👇 Pague aqui:\n${url}\n\nMe envia o comprovante. 📸`,

  pedir_docs: (n) =>
    `✅ Pagamento confirmado, *${n}*!\n\nPara formalizar seu contrato, preciso de:\n\n📄 *1 - Foto do RG* (frente e verso)\n📄 *2 - Foto do CPF*\n\nEnvie as fotos aqui agora. 👆`,

  confirmar_docs: (n) =>
    `📁 Documentos recebidos!\n\n🎉 *${n}, seu processo foi oficialmente aberto.*\n\nNossa equipe jurídica já está trabalhando no seu caso. Em breve você receberá atualizações aqui. 💪`,

  humano: () =>
    `👋 Conectando com um especialista agora...`,

  nao_entendi: () =>
    `Responde com o *número* da opção. 😊`,
};

// ─────────────────────────────────────────────────────────────
//  WEBHOOK
// ─────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  console.log("━━━━ MSG ━━━━", JSON.stringify(req.body).substring(0,150));
  try {
    const id      = getId(req.body);
    const rawMsg  = (req.body.message || "").trim();
    const msg     = rawMsg.toLowerCase();
    const num     = rawMsg.replace(/[^0-9]/g,""); // extrai só o número
    const c       = await get(id);
    let { etapa, nome: n, modoHumano } = c;

    if (modoHumano) return res.json({ reply:"" });

    // Pedido de humano a qualquer momento
    if (/humano|atendente|falar com (algu[eé]m|pessoa)|quero humano/i.test(msg)) {
      c.modoHumano = true; await save(id,c);
      return res.json({ reply: M.humano() });
    }

    // Reinício
    if (etapa === 0 || isOi(rawMsg)) {
      Object.assign(c, { etapa:1, nome:"", dados:"" });
      await save(id,c);
      return res.json({ reply: M.inicio() });
    }

    let reply = "";

    // ── E1: captura nome ──────────────────────────────────────
    if (etapa === 1) {
      c.nome = nome(rawMsg); n = c.nome;
      c.etapa = 2;
      reply = M.menu_principal(n);

    // ── E2: menu principal ────────────────────────────────────
    } else if (etapa === 2) {
      if      (num==="1") { c.etapa=3; reply = M.onde_restricoes(); }
      else if (num==="2") { c.etapa=20; reply = M.como_funciona(); }
      else if (num==="3") { c.etapa=3; reply = M.onde_restricoes(); }
      else                { reply = M.nao_entendi() + "\n\n" + M.menu_principal(n); }

    // ── E20: como funciona ────────────────────────────────────
    } else if (etapa === 20) {
      if      (num==="1") { c.etapa=3; reply = M.onde_restricoes(); }
      else if (num==="2") { c.etapa=2; reply = M.menu_principal(n); }
      else                { reply = M.nao_entendi() + "\n\n" + M.como_funciona(); }

    // ── E3: onde estão restrições ─────────────────────────────
    } else if (etapa === 3) {
      if (["1","2","3","4","5"].includes(num)) {
        const lugares = {1:"Serasa",2:"SPC",3:"banco",4:"cartório",5:"local não identificado"};
        c.dados = `Restrição: ${lugares[num]||"?"}`;
        c.etapa = 4;
        reply = M.ja_tentou();
      } else { reply = M.nao_entendi() + "\n\n" + M.onde_restricoes(); }

    // ── E4: já tentou ─────────────────────────────────────────
    } else if (etapa === 4) {
      if (num==="1"||num==="2") { c.etapa=5; reply = M.posicionamento(n); }
      else { reply = M.nao_entendi() + "\n\n" + M.ja_tentou(); }

    // ── E5: posicionamento / oferta diagnóstico ───────────────
    } else if (etapa === 5) {
      if      (num==="1") { c.etapa=6; reply = M.coletar_dados(); }
      else if (num==="2") { c.etapa=51; reply = M.obj_valor(); }
      else if (num==="3") { c.etapa=52; reply = M.obj_pensar(); }
      else                { reply = M.nao_entendi() + "\n\n" + M.posicionamento(n); }

    // ── E51: objeção valor R$50 ───────────────────────────────
    } else if (etapa === 51) {
      if      (num==="1") { c.etapa=6; reply = M.coletar_dados(); }
      else if (num==="2") { c.etapa=53; reply = M.obj_pensar(); }
      else                { reply = M.nao_entendi() + "\n\n" + M.obj_valor(); }

    // ── E52: objeção preciso pensar ───────────────────────────
    } else if (etapa === 52) {
      if      (num==="1") { c.etapa=53; reply = M.obj_confiavel(); }
      else if (num==="2") { c.etapa=54; reply = M.obj_sem_dinheiro(); }
      else if (num==="3") { c.etapa=20; reply = M.como_funciona(); }
      else if (num==="4") { reply = `Tudo bem! Quando quiser, é só mandar um *Oi* que retomamos. 😊`; c.etapa=0; }
      else                { reply = M.nao_entendi() + "\n\n" + M.obj_pensar(); }

    // ── E53: objeção confiabilidade ───────────────────────────
    } else if (etapa === 53) {
      if      (num==="1") { c.etapa=6; reply = M.coletar_dados(); }
      else if (num==="2") { c.modoHumano=true; reply = M.humano(); }
      else                { reply = M.nao_entendi() + "\n\n" + M.obj_confiavel(); }

    // ── E54: objeção sem dinheiro agora ───────────────────────
    } else if (etapa === 54) {
      if      (num==="1") { c.etapa=6; reply = M.coletar_dados(); }
      else if (num==="2") { reply = `Perfeito! Quando estiver pronto, é só mandar *Oi* aqui. 😊`; c.etapa=0; }
      else                { reply = M.nao_entendi() + "\n\n" + M.obj_sem_dinheiro(); }

    // ── E6: coleta dados CPF ──────────────────────────────────
    } else if (etapa === 6) {
      c.dados = rawMsg;
      c.etapa = 7;
      const url = `${BASE_URL}/pix/50`;
      reply = M.enviar_pix50(url);

    // ── E7: aguarda comprovante R$50 (qualquer envio = comprovante) ─
    } else if (etapa === 7) {
      c.etapa = 8;
      c.modoHumano = true;
      reply = M.confirmar_pix50(n);

    // ── E8: resultado diagnóstico ─────────────────────────────
    } else if (etapa === 8) {
      if      (num==="1") { c.etapa=9; reply = M.oferta_servico(n); }
      else if (num==="2") { c.etapa=53; reply = M.obj_confiavel(); }
      else                { reply = M.nao_entendi() + "\n\n" + M.confirmar_pix50(n); }

    // ── E9: oferta serviço completo ───────────────────────────
    } else if (etapa === 9) {
      if      (num==="1") { c.etapa=10; reply = M.enviar_pix250(`${BASE_URL}/pix/250`); }
      else if (num==="2") { c.etapa=91; reply = M.obj_caro(); }
      else if (num==="3") { c.etapa=92; reply = M.obj_e_se_falhar(); }
      else if (num==="4") { c.etapa=93; reply = M.obj_tempo(); }
      else                { reply = M.nao_entendi() + "\n\n" + M.oferta_servico(n); }

    // ── E91: objeção caro / sem dinheiro ─────────────────────
    } else if (etapa === 91) {
      if      (num==="1") { c.etapa=10; reply = M.enviar_pix250(`${BASE_URL}/pix/250`); }
      else if (num==="2") { reply = `Sem problema! Quando estiver pronto, manda um *Oi* aqui. 😊`; c.etapa=0; }
      else                { reply = M.nao_entendi() + "\n\n" + M.obj_caro(); }

    // ── E92: objeção e se falhar ──────────────────────────────
    } else if (etapa === 92) {
      if      (num==="1") { c.etapa=10; reply = M.enviar_pix250(`${BASE_URL}/pix/250`); }
      else if (num==="2") { c.etapa=9; reply = M.oferta_servico(n); }
      else                { reply = M.nao_entendi() + "\n\n" + M.obj_e_se_falhar(); }

    // ── E93: objeção tempo ────────────────────────────────────
    } else if (etapa === 93) {
      if      (num==="1") { c.etapa=10; reply = M.enviar_pix250(`${BASE_URL}/pix/250`); }
      else if (num==="2") { c.etapa=9; reply = M.oferta_servico(n); }
      else                { reply = M.nao_entendi() + "\n\n" + M.obj_tempo(); }

    // ── E10: aguarda comprovante R$250 ────────────────────────
    // ── E10: aguarda comprovante R$250 (qualquer envio = comprovante) ─
    } else if (etapa === 10) {
      c.etapa = 11;
      reply = M.pedir_docs(n);

    // ── E11: aguarda RG e CPF (qualquer envio = docs recebidos) ─
    } else if (etapa === 11) {
      c.etapa = 12;
      reply = M.confirmar_docs(n);

    // ── E12: processo aberto ──────────────────────────────────
    } else if (etapa === 12) {
      reply = `Processo em andamento! ✅ Qualquer novidade aviso aqui, ${n}. 💪`;

    } else {
      reply = `Oi, ${n}! 😊 Manda um *Oi* para acessar o menu.`;
    }

    await save(id, c);
    console.log(`[${id}] E${etapa}→E${c.etapa} reply="${reply.substring(0,60)}"`);
    res.json({ reply });

  } catch(err) {
    console.error("❌ Erro:", err.message);
    res.status(200).json({ reply:"Desculpe, tive um problema técnico. Pode repetir?" });
  }
});

// ── Pix ───────────────────────────────────────────────────────
app.get("/pix/:valor", async (req,res) => {
  try {
    const v = parseFloat(req.params.valor);
    if (isNaN(v)||v<=0) return res.status(400).send("Valor inválido");
    res.setHeader("Content-Type","text/html;charset=utf-8");
    res.send(await paginaPix(v));
  } catch(e) { res.status(500).send("Erro: "+e.message); }
});

// ── Debug ─────────────────────────────────────────────────────
app.get("/debug", async (req,res) => {
  const rok = await redis.ping().then(()=>true).catch(()=>false);
  res.json({ status:"ok", redis:rok, baseUrl:BASE_URL, node:process.version });
});

// ── Admin ─────────────────────────────────────────────────────
app.post("/assumir", async (req,res) => { const c=await get(req.body.telefone); c.modoHumano=true;  await save(req.body.telefone,c); res.json({ok:true}); });
app.post("/liberar", async (req,res) => { const c=await get(req.body.telefone); c.modoHumano=false; await save(req.body.telefone,c); res.json({ok:true}); });
app.post("/resetar", async (req,res) => { await redis.del(`c:${req.body.telefone}`); res.json({ok:true}); });
app.get("/contatos", async (req,res) => {
  const keys = await redis.keys("c:*");
  if (!keys.length) return res.json([]);
  const vals = await Promise.all(keys.map(k=>redis.get(k)));
  res.json(keys.map((k,i)=>({id:k.replace("c:",""),...vals[i]})));
});
app.get("/", (_,res) => res.send("🤖 JustHelp Bot v9 — Online ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`✅ JustHelp Bot v9 | porta ${PORT}`));
