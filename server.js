const express = require("express");
const { Redis } = require("@upstash/redis");
const QRCode = require("qrcode");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Credenciais ───────────────────────────────────────────────
const redis = new Redis({
  url: "https://gorgeous-warthog-98319.upstash.io",
  token: "gQAAAAAAAYAPAAIncDIwNjA2ZjEyZDUwZGQ0YTJmOGEyOWExMzk5ODIwOTI4MnAyOTgzMTk",
});
const DEEPSEEK_KEY = "sk-c05be12eec56495db38070240180103e";
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : process.env.BASE_URL || "https://whatauto-bot-production.up.railway.app";

console.log("✅ Servidor iniciando | BASE_URL:", BASE_URL);

// ─────────────────────────────────────────────────────────────
//  PIX QR CODE
// ─────────────────────────────────────────────────────────────
function pixField(id, value) {
  return `${id}${String(value.length).padStart(2,"0")}${value}`;
}
function pixCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4,"0");
}
function gerarPixPayload(valor) {
  const chave = "justhelpadv@gmail.com";
  const nome  = "JustHelp Adv";
  const cidade = "Sao Paulo";
  const mercAcc = pixField("00","BR.GOV.BCB.PIX") + pixField("01", chave);
  const addData = pixField("05","JUSTHELPADV");
  const p =
    pixField("00","01") + pixField("01","12") + pixField("26", mercAcc) +
    pixField("52","0000") + pixField("53","986") +
    pixField("54", Number(valor).toFixed(2)) +
    pixField("58","BR") + pixField("59", nome) + pixField("60", cidade) +
    pixField("62", addData) + "6304";
  return p + pixCRC16(p);
}
async function gerarPaginaPix(valor) {
  const payload   = gerarPixPayload(valor);
  const qrDataUrl = await QRCode.toDataURL(payload, { width: 280, margin: 2 });
  const label     = valor == 50 ? "Diagnóstico de CPF" : "Entrada — Restauração de Crédito";
  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pagar R$ ${Number(valor).toFixed(2).replace(".",",")} — JustHelp</title>
<style>*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;border-radius:20px;padding:32px 24px;max-width:380px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center}
.logo{background:#1D7874;color:#fff;border-radius:12px;padding:10px 20px;display:inline-block;font-weight:700;font-size:18px;margin-bottom:20px}
.valor{font-size:38px;font-weight:700;color:#1D7874;margin-bottom:4px}
.label{color:#888;font-size:14px;margin-bottom:24px}
.qr{background:#f8f9fa;border-radius:16px;padding:16px;display:inline-block;margin-bottom:20px}
.qr img{display:block;width:240px;height:240px}
.steps{text-align:left;margin-bottom:20px}
.step{display:flex;align-items:flex-start;gap:12px;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#444}
.step:last-child{border:none}
.n{background:#1D7874;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:1px}
.copia{background:#f8f9fa;border-radius:12px;padding:12px;font-family:monospace;font-size:11px;color:#333;word-break:break-all;margin-bottom:12px;text-align:left;line-height:1.5}
.btn{width:100%;padding:16px;border-radius:12px;border:none;font-size:16px;font-weight:700;cursor:pointer;background:#1D7874;color:#fff;margin-bottom:10px}
.btn.ok{background:#22c55e}
.aviso{font-size:12px;color:#aaa;margin-top:16px}</style></head>
<body><div class="card">
<div class="logo">JustHelp</div>
<div class="valor">R$ ${Number(valor).toFixed(2).replace(".",",")}</div>
<div class="label">${label}</div>
<div class="qr"><img src="${qrDataUrl}" alt="QR Code Pix"></div>
<div class="steps">
<div class="step"><span class="n">1</span><span>Abra seu banco ou app de pagamentos</span></div>
<div class="step"><span class="n">2</span><span>Escolha <strong>Pix → Ler QR Code</strong> ou <strong>Copia e Cola</strong></span></div>
<div class="step"><span class="n">3</span><span>Escaneie ou cole o código abaixo</span></div>
</div>
<div class="copia" id="cod">${payload}</div>
<button class="btn" id="btn" onclick="copiar()">📋 Copiar código Pix</button>
<div class="aviso">⚠️ Após pagar, envie o comprovante no WhatsApp para confirmar.</div>
</div>
<script>function copiar(){navigator.clipboard.writeText(document.getElementById('cod').textContent).then(()=>{const b=document.getElementById('btn');b.textContent='✅ Copiado!';b.classList.add('ok');setTimeout(()=>{b.textContent='📋 Copiar código Pix';b.classList.remove('ok')},3000)})}</script>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────
//  ESTADO
// ─────────────────────────────────────────────────────────────
async function getContato(id) {
  try { return (await redis.get(`c:${id}`)) || { etapa:0, nome:"", dados:"", historico:[], modoHumano:false }; }
  catch(e) { console.error("Redis get:",e.message); return { etapa:0, nome:"", dados:"", historico:[], modoHumano:false }; }
}
async function salvarContato(id, c) {
  try { await redis.set(`c:${id}`, c); }
  catch(e) { console.error("Redis set:",e.message); }
}
function identificarContato(body) {
  const phone  = (body.phone  || "").toString().trim();
  const sender = (body.sender || "").toString().trim();
  console.log(`📱 phone="${phone}" sender="${sender}"`);
  if (phone  && phone  !== "WhatsAuto app" && /\d/.test(phone))  return phone;
  if (sender && sender !== "WhatsAuto app" && sender !== "") return sender;
  return `teste_${Date.now()}`;
}
function capitalizarNome(t) {
  return t.trim().split(" ").map(p=>p.charAt(0).toUpperCase()+p.slice(1).toLowerCase()).join(" ");
}
function ehSaudacao(msg) {
  return /^(oi|ol[aá]|oii+|boa|bom dia|boa tarde|boa noite|hello|hi|hey|e a[íi]|tudo bem|opa|salve|boas|al[oô])[\s!?.]*$/i.test(msg.trim());
}
function ehComprovante(msg) {
  if (!msg || msg.trim()==="") return true;
  return /paguei|pago|fiz o? ?pix|transferi|enviado|efetuado|feito|realizei|conclu[íi]do|t[aá] aqui|pronto|segue|comprovante|print/i.test(msg);
}

// ─────────────────────────────────────────────────────────────
//  DEEPSEEK
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é o agente virtual da JustHelp Assessoria Jurídica, especializado em restauração de crédito no WhatsApp.

SOBRE A JUSTHELP:
- Escritório jurídico. NÃO fazemos renegociação. Fazemos análise jurídica para remover restrições por irregularidades
- Trabalhamos com ética e transparência total

PREÇOS:
- Diagnóstico CPF: R$ 50 (abatido se seguir com processo)
- Entrada do processo: R$ 250
- Taxa de êxito: R$ 450 (SOMENTE após resultado comprovado)

FLUXO EM ORDEM:
1. Pergunte o nome do cliente
2. Pergunte a situação: sabe as pendências ou quer entender o processo?
3. Qualificação: onde estão as restrições, há quanto tempo, já tentou resolver?
4. Posicionamento: explique que somos diferentes (análise jurídica, não renegociação)
5. Oferte diagnóstico R$50 e peça aceite
6. Colete nome completo e CPF
7. Envie link Pix para R$50: ${BASE_URL}/pix/50 — use acao: "aguardar_pix_50"
8. (após comprovante) Entregue diagnóstico + apresente processo completo
9. Oferte R$250 entrada + R$450 êxito, quebre objeções
10. Envie link Pix para R$250: ${BASE_URL}/pix/250 — use acao: "aguardar_pix_250"
11. (após comprovante) Confirme processo aberto

OBJEÇÕES:
- "É golpe" → Escritório registrado. R$50 é para ver viabilidade antes de gastar mais
- "Não tenho R$50" → Menos que consulta médica. Volta abatido se seguir. Quando consegue?
- "Preciso pensar" → O que está travando? Tiro a dúvida agora
- "Já tentei" → Tentou renegociar? Nosso trabalho é jurídico, completamente diferente
- "Muito caro" → Com nome limpo volta a ter crédito. R$450 só paga após resultado
- "E se não funcionar" → R$450 SOMENTE se funcionar. Risco mínimo para você
- "Quero falar com pessoa" → use acao: "humano"

REGRAS:
- Linguagem simples e próxima. Use o nome do cliente sempre
- Mensagens curtas — é WhatsApp, não email
- *negrito* para valores importantes. Emojis com moderação
- Termine sempre com pergunta ou ação clara
- Nunca pressione agressivamente

RESPONDA SOMENTE COM JSON VÁLIDO:
{"resposta":"mensagem ao cliente","etapa":<1-11>,"acao":"continuar"|"humano"|"aguardar_pix_50"|"aguardar_pix_250"}`;

async function chamarIA(contato, msgCliente) {
  const ctx = `Estado: nome="${contato.nome||"?"}" etapa=${contato.etapa}
Histórico:\n${(contato.historico||[]).slice(-10).map(h=>`[${h.r==="c"?"CLIENTE":"BOT"}]: ${h.t}`).join("\n")}
Nova mensagem: "${msgCliente}"`;

  console.log(`🤖 DeepSeek — etapa=${contato.etapa} msg="${msgCliente.substring(0,60)}"`);
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), 20000);
  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method:"POST", signal:ctrl.signal,
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${DEEPSEEK_KEY}`},
      body:JSON.stringify({ model:"deepseek-chat", max_tokens:500, temperature:0.7,
        messages:[{role:"system",content:SYSTEM_PROMPT},{role:"user",content:ctx}]
      })
    });
    clearTimeout(t);
    if (!r.ok) { console.error("DeepSeek HTTP:",r.status, await r.text()); return null; }
    const data = await r.json();
    const raw  = data.choices?.[0]?.message?.content || "";
    console.log("DeepSeek raw:", raw.substring(0,200));
    return JSON.parse(raw.replace(/```json|```/g,"").trim());
  } catch(e) { clearTimeout(t); console.error("DeepSeek erro:",e.message); return null; }
}

// ─────────────────────────────────────────────────────────────
//  WEBHOOK
// ─────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  console.log("\n━━━━ WEBHOOK ━━━━");
  console.log("Body:", JSON.stringify(req.body).substring(0,200));
  try {
    const id  = identificarContato(req.body);
    const msg = (req.body.message || "").trim();
    const contato = await getContato(id);
    let { etapa, nome, historico=[], modoHumano } = contato;

    if (modoHumano) return res.json({ reply:"" });

    // ── Início ou saudação ───────────────────────────────────
    if (etapa === 0 || ehSaudacao(msg)) {
      Object.assign(contato, { etapa:1, nome:"", dados:"", historico:[] });
      await salvarContato(id, contato);
      return res.json({ reply:"Opa, tudo bem? 😊\n\nAntes de começarmos, me fala seu *nome* para eu saber com quem estou conversando e te atender melhor." });
    }

    // ── Captura nome ─────────────────────────────────────────
    if (etapa === 1) {
      nome = capitalizarNome(msg);
      contato.nome = nome;
      historico.push({r:"c",t:msg});
      const ia = await chamarIA({...contato,etapa:2}, `Meu nome é ${nome}`);
      const reply = ia?.resposta || `Prazer, *${nome}*! 😊\n\nMe conta sua situação: você já sabe quais pendências estão travando seu CPF ou quer entender como funciona nosso processo?`;
      contato.etapa = ia?.etapa || 2;
      historico.push({r:"b",t:reply});
      contato.historico = historico.slice(-20);
      await salvarContato(id, contato);
      return res.json({ reply });
    }

    // ── Comprovante R$50 ─────────────────────────────────────
    if (etapa === 7 && ehComprovante(msg)) {
      historico.push({r:"c",t:"[comprovante pix R$50]"});
      const ia = await chamarIA({...contato,etapa:8},"[cliente enviou comprovante do pix de R$50]");
      const reply = ia?.resposta || `Comprovante recebido! ✅ Obrigado, ${nome}!\n\nJá analisei seu CPF. Identificamos restrições com *viabilidade real* de remoção jurídica. O cenário é favorável! ✅\n\nQuer entender como funciona o processo completo?`;
      contato.etapa = ia?.etapa || 8;
      historico.push({r:"b",t:reply});
      contato.historico = historico.slice(-20);
      await salvarContato(id, contato);
      return res.json({ reply });
    }

    // ── Comprovante R$250 ────────────────────────────────────
    if (etapa === 10 && ehComprovante(msg)) {
      historico.push({r:"c",t:"[comprovante pix R$250]"});
      const ia = await chamarIA({...contato,etapa:11},"[cliente enviou comprovante do pix de R$250]");
      const reply = ia?.resposta || `Entrada confirmada! 🎉 Obrigado, ${nome}!\n\nSeu processo foi aberto. Nossa equipe jurídica já está trabalhando no seu caso. Você receberá atualizações aqui! 💪`;
      contato.etapa = ia?.etapa || 11;
      historico.push({r:"b",t:reply});
      contato.historico = historico.slice(-20);
      await salvarContato(id, contato);
      return res.json({ reply });
    }

    // ── IA cuida de tudo o mais ──────────────────────────────
    historico.push({r:"c",t:msg});
    const ia = await chamarIA(contato, msg);

    const fallbacks = {
      2:`Entendido! E você sabe onde estão essas restrições? (Serasa, SPC, algum banco?)`,
      3:`Certo, ${nome}. Nosso trabalho é diferente: fazemos análise jurídica para encontrar *irregularidades* nas dívidas e pedir a remoção. Quer entender melhor?`,
      4:`Para verificar se seu caso tem viabilidade, faço um diagnóstico completo do seu CPF por *R$ 50*. Se seguir com o processo, esse valor já vem abatido. O que acha?`,
      5:`Ótimo! Me envia seu *nome completo* e *CPF* para preparar a consulta. 📋`,
      6:`Perfeito! Segue o link para pagamento:\n\n👇 ${BASE_URL}/pix/50\n\nAssim que pagar, me envia o comprovante. 📸`,
      8:`Para darmos entrada:\n\n✅ *Entrada:* R$ 250\n🏆 *Sucesso:* R$ 450 _(somente após êxito)_\n🎁 Os R$ 50 já abatidos!\n\nPosso seguir?`,
      9:`Perfeito! Segue o link:\n\n👇 ${BASE_URL}/pix/250\n\nAssim que pagar, me envia o comprovante. 📸`,
    };
    let reply = ia?.resposta || fallbacks[etapa] || "Desculpe, pode repetir?";

    if (ia?.etapa && ia.etapa >= contato.etapa) contato.etapa = ia.etapa;
    if (ia?.acao === "humano")           { contato.modoHumano = true; reply = "Um momento! 👋 Vou te conectar com um especialista agora..."; }
    if (ia?.acao === "aguardar_pix_50")  { contato.etapa = 7;  if (!reply.includes("pix/50"))  reply += `\n\n👇 ${BASE_URL}/pix/50`; }
    if (ia?.acao === "aguardar_pix_250") { contato.etapa = 10; if (!reply.includes("pix/250")) reply += `\n\n👇 ${BASE_URL}/pix/250`; }

    historico.push({r:"b",t:reply});
    contato.historico = historico.slice(-20);
    await salvarContato(id, contato);
    console.log(`✅ Reply: "${reply.substring(0,80)}"`);
    res.json({ reply });

  } catch(err) {
    console.error("❌ Erro geral:", err.message);
    res.status(200).json({ reply:"Desculpe, tive um problema técnico. Pode repetir?" });
  }
});

// ─────────────────────────────────────────────────────────────
//  ROTAS
// ─────────────────────────────────────────────────────────────
app.get("/debug", async (req, res) => {
  const redisOk = await redis.ping().then(()=>true).catch(()=>false);
  const dsOk = await fetch("https://api.deepseek.com/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${DEEPSEEK_KEY}`},
    body:JSON.stringify({model:"deepseek-chat",max_tokens:5,messages:[{role:"user",content:"oi"}]})
  }).then(r=>r.ok).catch(()=>false);
  res.json({ status:"ok", redis:redisOk, deepseek:dsOk, baseUrl:BASE_URL, nodeVersion:process.version });
});

app.get("/pix/:valor", async (req, res) => {
  try {
    const valor = parseFloat(req.params.valor);
    if (isNaN(valor)||valor<=0) return res.status(400).send("Valor inválido");
    res.setHeader("Content-Type","text/html; charset=utf-8");
    res.send(await gerarPaginaPix(valor));
  } catch(e) { res.status(500).send("Erro: "+e.message); }
});

app.post("/assumir", async (req,res) => { const c=await getContato(req.body.telefone); c.modoHumano=true;  await salvarContato(req.body.telefone,c); res.json({ok:true}); });
app.post("/liberar", async (req,res) => { const c=await getContato(req.body.telefone); c.modoHumano=false; await salvarContato(req.body.telefone,c); res.json({ok:true}); });
app.post("/resetar", async (req,res) => { await redis.del(`c:${req.body.telefone}`); res.json({ok:true}); });
app.get("/contatos", async (req,res) => {
  const keys = await redis.keys("c:*");
  if (!keys.length) return res.json([]);
  const vals = await Promise.all(keys.map(k=>redis.get(k)));
  res.json(keys.map((k,i)=>({id:k.replace("c:",""),...vals[i]})).filter(c=>!c.id.startsWith("teste_")));
});
app.get("/", (_,res) => res.send("🤖 JustHelp Bot v8 — Online ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ JustHelp Bot v8 | porta ${PORT} | ${BASE_URL}`));
