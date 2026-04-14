const express = require("express");
const { Redis } = require("@upstash/redis");
const { gerarPaginaPix } = require("./pix");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const REDIS_URL   = "https://gorgeous-warthog-98319.upstash.io";
const REDIS_TOKEN = "gQAAAAAAAYAPAAIncDIwNjA2ZjEyZDUwZGQ0YTJmOGEyOWExMzk5ODIwOTI4MnAyOTgzMTk";
const DEEPSEEK_KEY = "sk-c05be12eec56495db38070240180103e";

let redis;
try {
  redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
  console.log("✅ Redis conectado");
} catch (e) {
  console.error("❌ Redis erro:", e.message);
}

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : process.env.BASE_URL || "https://whatauto-bot-production.up.railway.app";

// ── Estado ────────────────────────────────────────────────────
async function getContato(id) {
  try {
    return (await redis.get(`c:${id}`)) || { etapa: 0, nome: "", dados: "", historico: [], modoHumano: false };
  } catch (e) {
    console.error("Redis get erro:", e.message);
    return { etapa: 0, nome: "", dados: "", historico: [], modoHumano: false };
  }
}

async function salvarContato(id, c) {
  try { await redis.set(`c:${id}`, c); }
  catch (e) { console.error("Redis set erro:", e.message); }
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
  return t.trim().split(" ").map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

function ehSaudacao(msg) {
  return /^(oi|ol[aá]|oii+|boa|bom dia|boa tarde|boa noite|hello|hi|hey|e a[íi]|tudo bem|opa|salve|boas|al[oô])[\s!?.]*$/i.test(msg.trim());
}

function ehComprovante(msg) {
  if (!msg || msg.trim() === "") return true;
  return /paguei|pago|fiz o? ?pix|transferi|enviado|efetuado|feito|realizei|conclu[íi]do|aqui (est[aá]|ta|t[aá])|t[aá] aqui|pronto|segue|comprovante|screenshot|print/i.test(msg);
}

// ── DeepSeek ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é o agente virtual da JustHelp Assessoria Jurídica, especializado em restauração de crédito no WhatsApp.

SOBRE A JUSTHELP:
- Escritório jurídico especializado em restauração de crédito
- NÃO fazemos renegociação. Fazemos análise jurídica para remover restrições por irregularidades
- Trabalhamos com ética e transparência

PREÇOS:
- Diagnóstico CPF: R$ 50 (abatido se seguir)
- Entrada do processo: R$ 250
- Taxa de êxito: R$ 450 (SOMENTE após resultado)

FLUXO:
1. Pergunte o nome
2. Contexto: situação das dívidas/restrições
3. Qualificação: onde estão as restrições, há quanto tempo
4. Posicionamento: explique que somos diferentes (análise jurídica, não renegociação)
5. Oferta diagnóstico R$50: peça aceite
6. Colete nome completo e CPF
7. Envie link Pix R$50: ${BASE_URL}/pix/50 — retorne acao: "aguardar_pix_50"
8. Confirme comprovante, entregue diagnóstico, apresente processo completo
9. Oferta R$250 entrada + R$450 êxito
10. Envie link Pix R$250: ${BASE_URL}/pix/250 — retorne acao: "aguardar_pix_250"
11. Confirme pagamento, informe que processo foi aberto

OBJEÇÕES:
- "É golpe" → Escritório registrado. R$50 é para ver viabilidade antes de gastar mais. Risco mínimo
- "Não tenho R$50" → Menos que uma consulta médica. Volta abatido se seguir. Quando consegue?
- "Preciso pensar" → O que está travando? Tiro a dúvida agora
- "Já tentei" → Tentou renegociação? Nosso trabalho é jurídico, completamente diferente
- "Muito caro" → Com nome limpo volta a ter crédito. R$450 só paga após resultado
- "E se não funcionar" → R$450 só paga SE funcionar. Nosso risco é maior que o seu
- "Quero falar com pessoa" → retorne acao: "humano"

REGRAS:
- Linguagem simples, próxima, sem jargão
- Use o nome do cliente
- Mensagens curtas — é WhatsApp
- *negrito* para destacar valores importantes
- Emojis com moderação
- Termine sempre com pergunta ou ação
- NUNCA pressione agressivamente

RESPONDA SOMENTE COM JSON VÁLIDO:
{"resposta": "mensagem ao cliente", "etapa": <1-11>, "acao": "continuar"|"humano"|"aguardar_pix_50"|"aguardar_pix_250"}`;

async function chamarIA(contato, msgCliente) {
  const { nome, etapa, historico = [] } = contato;

  const contexto = `Estado: nome="${nome || "não informado"}" etapa=${etapa}
Histórico:
${historico.slice(-10).map(h => `[${h.r === "c" ? "CLIENTE" : "BOT"}]: ${h.t}`).join("\n")}
Nova mensagem: "${msgCliente}"`;

  console.log(`🤖 Chamando DeepSeek — etapa=${etapa} msg="${msgCliente.substring(0,50)}"`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 500,
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: contexto }
        ]
      }),
    });
    clearTimeout(timeout);

    if (!r.ok) {
      const err = await r.text();
      console.error("DeepSeek status:", r.status, err);
      return null;
    }

    const data = await r.json();
    console.log("DeepSeek resposta raw:", JSON.stringify(data).substring(0, 200));
    const raw = data.choices?.[0]?.message?.content || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    console.log("✅ DeepSeek parseado:", JSON.stringify(parsed).substring(0, 150));
    return parsed;
  } catch (e) {
    clearTimeout(timeout);
    console.error("❌ DeepSeek erro:", e.message);
    return null;
  }
}

// ── Webhook ───────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  console.log("\n━━━━━━ WEBHOOK ━━━━━━");
  console.log("Body:", JSON.stringify(req.body).substring(0, 200));

  try {
    const id  = identificarContato(req.body);
    const msg = (req.body.message || "").trim();

    if (!msg && !req.body.phone && !req.body.sender) {
      console.log("⚠️ Corpo vazio, ignorando");
      return res.json({ reply: "" });
    }

    const contato  = await getContato(id);
    let { etapa, nome, historico = [], modoHumano } = contato;

    console.log(`👤 ID=${id} etapa=${etapa} nome="${nome}" msg="${msg}"`);

    // Modo humano
    if (modoHumano) {
      console.log("🙋 Modo humano ativo — silenciando bot");
      return res.json({ reply: "" });
    }

    // Novo contato ou saudação
    if (etapa === 0 || ehSaudacao(msg)) {
      console.log("👋 Iniciando conversa do zero");
      contato.etapa = 1; contato.nome = ""; contato.dados = ""; contato.historico = [];
      const resposta = "Opa, tudo bem? 😊\n\nAntes de começarmos, me fala seu *nome* para eu saber com quem estou conversando e te atender melhor.";
      await salvarContato(id, contato);
      return res.json({ reply: resposta });
    }

    // Captura nome (etapa 1)
    if (etapa === 1) {
      nome = capitalizarNome(msg);
      contato.nome = nome;
      historico.push({ r: "c", t: msg });
      console.log(`📝 Nome capturado: ${nome}`);
      const ia = await chamarIA({ ...contato, etapa: 2 }, `Meu nome é ${nome}`);
      const resposta = ia?.resposta || `Prazer, *${nome}*! 😊\n\nMe conta sua situação: você já sabe quais pendências estão travando seu CPF hoje ou quer entender como funciona nosso processo?`;
      contato.etapa = ia?.etapa || 2;
      historico.push({ r: "b", t: resposta });
      contato.historico = historico.slice(-20);
      await salvarContato(id, contato);
      return res.json({ reply: resposta });
    }

    // Comprovante R$50
    if (etapa === 7 && ehComprovante(msg)) {
      console.log("💰 Comprovante R$50 detectado");
      historico.push({ r: "c", t: "[comprovante pix R$50]" });
      const ia = await chamarIA({ ...contato, etapa: 8 }, "[cliente acabou de enviar comprovante do pagamento de R$50 do diagnóstico]");
      const resposta = ia?.resposta || `Comprovante recebido! ✅ Obrigado, ${nome}!\n\nJá iniciei sua análise de CPF. Aguarda um instante... 🔍\n\n${nome}, terminei! Identificamos restrições com *viabilidade real* de remoção jurídica. O cenário é favorável para sua restauração de crédito. ✅\n\nQuer que eu explique como funciona o processo completo?`;
      contato.etapa = ia?.etapa || 8;
      historico.push({ r: "b", t: resposta });
      contato.historico = historico.slice(-20);
      await salvarContato(id, contato);
      return res.json({ reply: resposta });
    }

    // Comprovante R$250
    if (etapa === 10 && ehComprovante(msg)) {
      console.log("💰 Comprovante R$250 detectado");
      historico.push({ r: "c", t: "[comprovante pix R$250]" });
      const ia = await chamarIA({ ...contato, etapa: 11 }, "[cliente enviou comprovante do pagamento de R$250 da entrada]");
      const resposta = ia?.resposta || `Entrada confirmada! 🎉 Obrigado, ${nome}!\n\nSeu processo foi oficialmente aberto. Nossa equipe jurídica já está trabalhando no seu caso.\n\nVocê receberá atualizações aqui mesmo. Qualquer dúvida é só chamar! 💪`;
      contato.etapa = ia?.etapa || 11;
      historico.push({ r: "b", t: resposta });
      contato.historico = historico.slice(-20);
      await salvarContato(id, contato);
      return res.json({ reply: resposta });
    }

    // IA processa tudo o mais
    historico.push({ r: "c", t: msg });
    const ia = await chamarIA(contato, msg);

    let resposta = ia?.resposta;

    // Fallback se IA falhar
    if (!resposta) {
      console.log("⚠️ IA falhou — usando fallback");
      const fallbacks = {
        2: `Entendido! E você sabe onde estão essas restrições? (Serasa, SPC, algum banco específico?)`,
        3: `Certo, ${nome}. Vou ser transparente: nosso trabalho é diferente de renegociação. Fazemos análise jurídica para identificar *irregularidades* que permitem a remoção das restrições. Quer entender melhor?`,
        4: `Para sabermos se seu caso tem viabilidade, faço um diagnóstico completo do seu CPF por *R$ 50*. Se seguir com o processo, esse valor já vem abatido. O que acha?`,
        5: `Ótimo! Me envia seu *nome completo* e *CPF* para preparar a consulta. 📋`,
        6: `Perfeito! Segue o link para o pagamento de R$ 50:\n\n👇 ${BASE_URL}/pix/50\n\nAssim que pagar, me envia o comprovante aqui. 📸`,
        8: `Para darmos entrada no processo:\n\n✅ *Entrada:* R$ 250\n🏆 *Sucesso:* R$ 450 _(somente após o êxito)_\n🎁 Os R$ 50 já estão abatidos!\n\nPosso seguir?`,
        9: `Perfeito! Segue o link para o pagamento de R$ 250:\n\n👇 ${BASE_URL}/pix/250\n\nAssim que pagar, me envia o comprovante. 📸`,
      };
      resposta = fallbacks[etapa] || `Desculpe, tive um problema técnico. Pode repetir sua mensagem?`;
    }

    if (ia?.etapa && ia.etapa >= contato.etapa) contato.etapa = ia.etapa;
    if (ia?.acao === "humano") { contato.modoHumano = true; resposta = "Um momento! 👋 Vou te conectar com um especialista agora..."; }
    if (ia?.acao === "aguardar_pix_50")  { contato.etapa = 7;  if (!resposta.includes("pix/50"))  resposta += `\n\n👇 ${BASE_URL}/pix/50`; }
    if (ia?.acao === "aguardar_pix_250") { contato.etapa = 10; if (!resposta.includes("pix/250")) resposta += `\n\n👇 ${BASE_URL}/pix/250`; }

    historico.push({ r: "b", t: resposta });
    contato.historico = historico.slice(-20);
    await salvarContato(id, contato);

    console.log(`✅ Resposta enviada: "${resposta.substring(0,80)}"`);
    res.json({ reply: resposta });

  } catch (err) {
    console.error("❌ Erro geral:", err.message, err.stack);
    res.status(200).json({ reply: "Desculpe, tive um problema técnico. Pode repetir?" });
  }
});

// ── Rota de diagnóstico ───────────────────────────────────────
app.get("/debug", async (req, res) => {
  const redisOk = await redis.ping().then(() => true).catch(() => false);
  const deepseekOk = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({ model: "deepseek-chat", max_tokens: 10, messages: [{ role: "user", content: "oi" }] })
  }).then(r => r.ok).catch(() => false);

  res.json({ status: "ok", redis: redisOk, deepseek: deepseekOk, baseUrl: BASE_URL });
});

// ── Rota de teste do webhook ──────────────────────────────────
app.get("/teste/:msg", async (req, res) => {
  const fakeReq = { body: { phone: "5511999990001", sender: "Teste", message: req.params.msg } };
  const fakeRes = { json: (d) => res.json(d) };
  app._router.handle({ ...fakeReq, method: "POST", url: "/webhook", path: "/webhook" }, fakeRes, () => {});
});

// ── Pix ───────────────────────────────────────────────────────
app.get("/pix/:valor", async (req, res) => {
  try {
    const valor = parseFloat(req.params.valor);
    if (isNaN(valor) || valor <= 0) return res.status(400).send("Valor inválido");
    const labels = { 50: "Diagnóstico de CPF", 250: "Entrada — Restauração de Crédito" };
    const html = await gerarPaginaPix(valor, labels[valor] || "Pagamento JustHelp");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) { res.status(500).send("Erro ao gerar QR Code: " + e.message); }
});

// ── Admin ─────────────────────────────────────────────────────
app.post("/assumir", async (req, res) => { const c = await getContato(req.body.telefone); c.modoHumano = true;  await salvarContato(req.body.telefone, c); res.json({ ok: true }); });
app.post("/liberar", async (req, res) => { const c = await getContato(req.body.telefone); c.modoHumano = false; await salvarContato(req.body.telefone, c); res.json({ ok: true }); });
app.post("/resetar", async (req, res) => { await redis.del(`c:${req.body.telefone}`); res.json({ ok: true }); });
app.get("/contatos", async (req, res) => {
  const keys = await redis.keys("c:*");
  if (!keys.length) return res.json([]);
  const vals = await Promise.all(keys.map(k => redis.get(k)));
  res.json(keys.map((k, i) => ({ id: k.replace("c:",""), ...vals[i] })).filter(c => !c.id.startsWith("teste_")));
});
app.get("/", (req, res) => res.send("🤖 JustHelp Bot v7 — Online ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ JustHelp Bot v7 na porta ${PORT} | BASE_URL=${BASE_URL}`));
