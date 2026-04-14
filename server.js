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
    `Opa, tudo bem? 😊\n\nAntes de começarmos, me fala seu *nome* para eu te atender melhor.`,

  menu_principal: (n) =>
    `Prazer, *${n}*! 😊\n\nComo posso te ajudar hoje?\n\n1️⃣ Quero limpar meu nome\n2️⃣ Entender como funciona\n3️⃣ Já sei o que quero, quero começar`,

  como_funciona: () =>
    `Ótima pergunta! 😊\n\nNosso trabalho é *diferente* de uma renegociação:\n\n✅ Fazemos uma *análise jurídica* das suas dívidas\n✅ Identificamos irregularidades (juros abusivos, prazo vencido, cobranças indevidas)\n✅ Pedimos juridicamente a *remoção das restrições*\n\nNão pagamos sua dívida — encontramos os erros jurídicos dela.\n\nO que prefere?\n\n1️⃣ Quero fazer um diagnóstico do meu CPF\n2️⃣ Voltar ao menu`,

  onde_restricoes: () =>
    `Entendido! Me conta: *onde estão suas restrições?*\n\n1️⃣ Serasa\n2️⃣ SPC\n3️⃣ Banco específico\n4️⃣ Cartório\n5️⃣ Não sei ao certo`,

  ja_tentou: () =>
    `Certo! Você já tentou resolver antes?\n\n1️⃣ Sim, já tentei renegociar ou parcelar\n2️⃣ Não, é minha primeira vez buscando ajuda`,

  posicionamento: (n) =>
    `${n}, entendo a situação. 💪\n\nMuita gente tenta renegociar e não resolve — porque a dívida continua lá.\n\nNosso trabalho é *jurídico*: analisamos se a dívida tem alguma irregularidade que permita a remoção. Muitas têm!\n\nO primeiro passo é um *diagnóstico completo do seu CPF* por apenas *R$ 50*.\n\nSe seguir com o processo completo, esse valor já vem *abatido*. 💡\n\nO que acha?\n\n1️⃣ Quero fazer o diagnóstico agora\n2️⃣ Tenho dúvidas sobre o valor\n3️⃣ Preciso pensar um pouco`,

  obj_valor: () =>
    `Entendo a dúvida! Mas pensa comigo: 😊\n\n💡 R$ 50 é menos que uma consulta médica\n💡 Se não houver viabilidade, você *saberá antes* de gastar mais\n💡 Se seguir em frente, esse valor já vem *abatido* do total\n\nÉ o caminho mais inteligente antes de qualquer passo maior.\n\n1️⃣ Ok, vou fazer o diagnóstico\n2️⃣ Ainda tenho dúvidas`,

  obj_pensar: () =>
    `Claro, sem pressão! 😊\n\nMas me conta: o que está te travando?\n\n1️⃣ Preocupado se é confiável\n2️⃣ Problema com o valor agora\n3️⃣ Quero entender melhor o processo\n4️⃣ Vou pensar e volto depois`,

  obj_confiavel: () =>
    `Entendo completamente — tem muita fraude por aí! 🙏\n\nSomos um *escritório jurídico registrado*. O diagnóstico de R$ 50 existe justamente para você ver a viabilidade *antes* de investir mais.\n\nSe não houver caminho, você saberá e não gasta mais nada. Nosso interesse é só atuar em casos viáveis.\n\n1️⃣ Faz sentido, vou fazer o diagnóstico\n2️⃣ Quero falar com um especialista`,

  obj_sem_dinheiro: () =>
    `Sem problema! R$ 50 pode parecer pouco, mas se não tiver agora, tudo bem. 😊\n\nQuando achar que é o momento certo, é só mandar um *Oi* aqui que retomamos.\n\n1️⃣ Na verdade consigo sim, vamos lá\n2️⃣ Vou guardar e volto em breve`,

  coletar_dados: () =>
    `Ótimo! 🎉 Já posso abrir o sistema.\n\nMe envia seu *nome completo* e *CPF* para preparar sua consulta. 📋`,

  enviar_pix50: (url) =>
    `Perfeito! Já estou com a tela aberta. 🖥️\n\n💳 *Valor:* R$ 50\n\n👇 *Clique para pagar (QR Code + Copia e Cola):*\n${url}\n\nAssim que pagar, me envia o comprovante aqui. 📸`,

  confirmar_pix50: (n) =>
    `Comprovante recebido! ✅ Obrigado, ${n}!\n\nJá iniciei sua análise... 🔍\n\n━━━━━━━━━━━━━━━\n📊 *RESULTADO DO DIAGNÓSTICO*\n━━━━━━━━━━━━━━━\n\nIdentificamos restrições no seu CPF com *viabilidade real* de atuação jurídica.\n\nO cenário é *favorável* para a restauração do seu crédito. ✅\n\nQuer que eu explique como funciona o processo completo?\n\n1️⃣ Sim, me conta!\n2️⃣ Tenho dúvidas`,

  oferta_servico: (n) =>
    `${n}, para darmos entrada e buscarmos a liberação do seu nome:\n\n✅ *Entrada:* R$ 250\n🏆 *Sucesso:* R$ 450 _(pago SOMENTE após o êxito)_\n🎁 *Bônus:* Os R$ 50 do diagnóstico já estão abatidos!\n\n⚠️ Se *não funcionar*, você *não paga* os R$ 450. Nosso risco é maior que o seu.\n\n1️⃣ Quero entrar no processo agora\n2️⃣ Tenho dúvidas sobre o valor\n3️⃣ E se não funcionar?\n4️⃣ Quanto tempo demora?`,

  obj_caro: () =>
    `Entendo! Mas pensa no cenário: 💪\n\nCom o nome limpo você volta a ter:\n✅ Cartão de crédito\n✅ Financiamentos\n✅ Crédito no mercado\n\nIsso vale muito mais que R$ 250. E os R$ 450 só pagam *quando o resultado aparecer*.\n\n1️⃣ Faz sentido, vou entrar\n2️⃣ Ainda não tenho o valor agora`,

  obj_e_se_falhar: () =>
    `Ótima pergunta! E a resposta é simples: 😊\n\n✅ Os R$ 450 de êxito são pagos *SOMENTE após o resultado*\n✅ Se não funcionar, você *não paga* esse valor\n✅ O risco real é nosso — só ganhamos se você ganhar\n\nNosso interesse é que funcione! 💪\n\n1️⃣ Entendi, quero entrar no processo\n2️⃣ Ainda tenho dúvidas`,

  obj_tempo: () =>
    `Boa pergunta! ⏱️\n\nA maioria dos casos tem resultado em *30 a 90 dias*.\nCasos mais simples: menos de 30 dias.\n\nAssim que você entrar, já começamos a contar. ⚡\n\n1️⃣ Ótimo, quero entrar agora\n2️⃣ Preciso pensar mais`,

  enviar_pix250: (url) =>
    `Perfeito! 🎉\n\n💳 *Entrada: R$ 250*\n\n👇 *Clique para pagar (QR Code + Copia e Cola):*\n${url}\n\nAssim que pagar, me envia o comprovante. 📸`,

  confirmar_pix250: (n) =>
    `Entrada confirmada! 🎉🎉\n\nObrigado, *${n}*! Seu processo foi *oficialmente aberto*.\n\nNossa equipe jurídica já está trabalhando no seu caso. 🏛️\n\nVocê receberá atualizações aqui mesmo. Qualquer dúvida é só chamar! 💪`,

  humano: () =>
    `Um momento! 👋 Vou te conectar com um dos nossos especialistas agora...`,

  nao_entendi: () =>
    `Não entendi. 😅 Por favor, responda com o *número* da opção desejada.`,
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

    // ── E7: aguarda comprovante R$50 ──────────────────────────
    } else if (etapa === 7) {
      if (isComprovante(rawMsg)) {
        c.etapa = 8;
        reply = M.confirmar_pix50(n);
      } else {
        reply = `Ainda aguardando seu comprovante, ${n}. 😊\n\nQuando pagar, é só me enviar a imagem ou print aqui. 📸`;
      }

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
    } else if (etapa === 10) {
      if (isComprovante(rawMsg)) {
        c.etapa = 11;
        reply = M.confirmar_pix250(n);
      } else {
        reply = `Ainda aguardando seu comprovante, ${n}. 😊\n\n👇 Link para pagar:\n${BASE_URL}/pix/250`;
      }

    // ── E11: processo aberto ──────────────────────────────────
    } else if (etapa === 11) {
      reply = `Processo em andamento! ✅ Nossa equipe jurídica está trabalhando, ${n}. Qualquer novidade aviso aqui! 💪`;

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
