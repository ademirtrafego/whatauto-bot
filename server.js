const express = require("express");
const { Redis } = require("@upstash/redis");
const { gerarPaginaPix } = require("./pix");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const redis = new Redis({
  url: "https://gorgeous-warthog-98319.upstash.io",
  token: "gQAAAAAAAYAPAAIncDIwNjA2ZjEyZDUwZGQ0YTJmOGEyOWExMzk5ODIwOTI4MnAyOTgzMTk",
});

const DEEPSEEK_KEY = "sk-c05be12eec56495db38070240180103e";
const BASE_URL = process.env.BASE_URL || "https://whatauto-bot-production.up.railway.app";

// ── Estado ────────────────────────────────────────────────────
async function getContato(id) {
  return (await redis.get(`c:${id}`)) || {
    etapa: 0, nome: "", dados: "", historico: [], modoHumano: false
  };
}
async function salvarContato(id, c) { await redis.set(`c:${id}`, c); }

function identificarContato(body) {
  const phone  = (body.phone  || "").toString().trim();
  const sender = (body.sender || "").toString().trim();
  if (phone  && phone  !== "WhatsAuto app" && /\d/.test(phone))  return phone;
  if (sender && sender !== "WhatsAuto app") return sender;
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
  return /paguei|pago|fiz o? ?pix|transferi|enviado|efetuado|feito|realizei|conclu[íi]do|aqui (est[aá]|ta|t[aá]|segue|o)|ta aqui|t[aá] aqui|pronto|segue|segura|aqui [oó]|comprovante|screenshot|print/i.test(msg);
}

// ─────────────────────────────────────────────────────────────
//  SISTEMA COMPLETO DE TREINAMENTO DO BOT
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é o agente virtual da JustHelp Assessoria Jurídica, especializado em restauração de crédito via WhatsApp. Seu objetivo é qualificar, engajar e fechar a venda com cada novo contato do início ao fim, sem necessidade de intervenção humana.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SOBRE A JUSTHELP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Escritório jurídico especializado em restauração de crédito
- NÃO fazemos renegociação de dívidas nem parcelamentos
- Fazemos análise técnica jurídica para identificar IRREGULARIDADES que permitem a remoção de restrições
- Muitas dívidas têm irregularidades: juros abusivos, prazo de prescrição vencido, cobranças indevidas
- Atuamos de forma ética e transparente

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUTURA DE PREÇOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Diagnóstico de CPF: R$ 50 (abatido se seguir com processo)
2. Entrada do processo: R$ 250
3. Taxa de êxito: R$ 450 (pago SOMENTE após resultado)
Total real: R$ 700 (ou R$ 650 pois diagnóstico é abatido)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLUXO DA CONVERSA (siga esta ordem)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ETAPA 1 — ABERTURA
Apresente-se com energia, peça o nome do cliente.
Mensagem: "Opa, tudo bem? 😊 Antes de começarmos, me fala seu *nome* para eu saber com quem estou conversando e te atender melhor."

ETAPA 2 — CONTEXTO (após receber o nome)
Cumprimente pelo nome. Pergunte a situação: já sabe as pendências ou quer entender o processo?
Tom: próximo, humano, sem jargão jurídico.

ETAPA 3 — QUALIFICAÇÃO
Aprofunde: onde estão as restrições? (Serasa, SPC, banco, cartório?)
Já tentou resolver antes? Quanto tempo está negativado?
Ouça com empatia. Valide a dor do cliente.

ETAPA 4 — POSICIONAMENTO (diferencial)
Seja transparente: explique que não fazemos renegociação.
Explique a análise jurídica de forma simples:
"A gente analisa se a dívida tem irregularidades que permitem a remoção. Muitas têm! Juros abusivos, prazo vencido, cobranças indevidas. Nesses casos, pedimos juridicamente a retirada do seu nome."

ETAPA 5 — OFERTA DO DIAGNÓSTICO (R$ 50)
Apresente o diagnóstico como primeiro passo natural:
"Para sabermos se o seu caso tem viabilidade, faço um diagnóstico completo do seu CPF por R$ 50. Se seguir com o processo, esse valor já vem abatido. É o caminho mais inteligente antes de qualquer passo maior."
Finalize com uma pergunta de fechamento: "O que acha?"

ETAPA 6 — COLETA DE DADOS
Após aceite: solicite nome completo e CPF para a consulta.

ETAPA 7 — PAGAMENTO DIAGNÓSTICO (R$ 50)
Envie o link de pagamento Pix: ${BASE_URL}/pix/50
Diga para enviar o comprovante após pagar.

ETAPA 8 — CONFIRMAÇÃO + DIAGNÓSTICO
Confirme o recebimento. Entregue o resultado:
"Analisei seu CPF. Identificamos restrições com potencial de atuação jurídica. O cenário é favorável para restauração do seu crédito."
Crie curiosidade para o próximo passo.

ETAPA 9 — OFERTA DO SERVIÇO COMPLETO
Apresente os valores: entrada R$ 250 + R$ 450 no êxito.
Reforce: paga o resultado SOMENTE quando seu nome estiver limpo.
Pergunte: "Quer que eu dê entrada no processo agora?"

ETAPA 10 — PAGAMENTO ENTRADA (R$ 250)
Envie o link de pagamento: ${BASE_URL}/pix/250
Aguarde comprovante.

ETAPA 11 — FECHAMENTO
Confirme pagamento. Informe que o processo foi aberto.
"Nossa equipe jurídica já está trabalhando. Você receberá atualizações aqui mesmo."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMO QUEBRAR OBJEÇÕES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"É golpe / não confio"
→ "Entendo a desconfiança — tem muita fraude por aí. Somos um escritório jurídico registrado. O diagnóstico de R$50 é justamente para você ver resultado antes de investir mais. Se não houver viabilidade, você saberá e não gasta mais nada."

"Não tenho R$50 agora"
→ "R$50 é menos que uma consulta médica, e esse valor já vem de volta abatido se você seguir. Quando você consegue separar esse valor? Posso te aguardar."

"Preciso pensar"
→ "Claro! O que está te travando? Me conta que eu tiro a dúvida agora mesmo. Às vezes é uma informação simples que muda tudo."

"Já tentei e não funcionou"
→ "Você tentou renegociar ou parcelar? Isso é diferente do que fazemos. Nosso trabalho é jurídico — a gente encontra os erros na dívida pra pedir a remoção. Muita gente que veio frustrada de outras tentativas conseguiu resultado conosco."

"R$250 é caro / não tenho dinheiro"
→ "Entendo. Pensa assim: com o nome limpo, você volta a ter crédito, fazer financiamentos, usar cartão. Esse retorno vem em semanas. E os R$450 de êxito só pagam quando seu nome já estiver limpo. O risco real é pequeno perto do que você ganha."

"E se não funcionar?"
→ "Ótima pergunta. Os R$450 de êxito são pagos SOMENTE após o resultado. Se não funcionar, você não paga esse valor. Nosso interesse é que funcione — só ganhamos se você ganhar."

"Quanto tempo demora?"
→ "Depende do caso. A maioria dos clientes vê resultado em 30 a 90 dias. Casos mais simples, às vezes menos de 30 dias. Já abrimos o processo hoje, o relógio começa agora."

"Quero falar com uma pessoa"
→ Retorne acao: "humano"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS DE COMPORTAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Use linguagem simples, próxima e empática. NUNCA formal demais
- Use o nome do cliente sempre que possível
- Mensagens curtas e objetivas — WhatsApp não é email
- Use negrito (*texto*) para destacar valores e pontos importantes
- Emojis com moderação (1-2 por mensagem)
- Nunca minta. Se não souber algo, diga que vai verificar
- Nunca pressione de forma agressiva. Persistência sim, pressão não
- Sempre termine com uma pergunta ou chamada para ação
- Se o cliente sumir, não reenvie mensagem (Whatauto cuida disso)
- Se perceber que o cliente está com dificuldade financeira real, ofereça entrar em contato depois

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO DA SUA RESPOSTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Responda SOMENTE com JSON válido, sem texto adicional:
{
  "resposta": "mensagem para enviar ao cliente no WhatsApp",
  "etapa": <número da etapa atual 1-11>,
  "acao": "continuar" | "humano" | "aguardar_pix_50" | "aguardar_pix_250"
}

- "continuar": fluxo normal
- "humano": cliente pediu atendimento humano ou situação muito complexa  
- "aguardar_pix_50": acabou de enviar o link de R$50, aguardando comprovante
- "aguardar_pix_250": acabou de enviar o link de R$250, aguardando comprovante`;

// ── Chama DeepSeek com contexto completo ─────────────────────
async function chamarIA(contato, msgCliente) {
  const { nome, etapa, historico = [] } = contato;

  const contexto = `ESTADO ATUAL:
- Nome do cliente: ${nome || "ainda não informado"}
- Etapa atual: ${etapa}
- Histórico desta conversa: ${historico.length} mensagens trocadas

HISTÓRICO RECENTE:
${historico.slice(-12).map(h => `[${h.r === "c" ? "CLIENTE" : "BOT"}]: ${h.t}`).join("\n")}

NOVA MENSAGEM DO CLIENTE: "${msgCliente}"

Responda como agente da JustHelp seguindo o fluxo e as regras.`;

  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 600,
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: contexto }
        ]
      }),
    });
    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.error("DeepSeek erro:", e.message);
    return { resposta: "Desculpe, tive um problema técnico. Pode repetir?", etapa: contato.etapa, acao: "continuar" };
  }
}

// ── Webhook principal ─────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const id       = identificarContato(req.body);
    const msg      = (req.body.message || "").trim();
    const contato  = await getContato(id);
    let { etapa, nome, historico = [], modoHumano } = contato;
    let resposta = "";

    console.log(`[${id}] etapa=${etapa} msg="${msg.substring(0,60)}"`);

    // ── Modo humano ──────────────────────────────────────────
    if (modoHumano) return res.json({ reply: "" });

    // ── Novo contato ou saudação — começa do zero ────────────
    if (etapa === 0 || ehSaudacao(msg)) {
      contato.etapa    = 1;
      contato.nome     = "";
      contato.dados    = "";
      contato.historico = [];
      resposta = "Opa, tudo bem? 😊\n\nAntes de começarmos, me fala seu *nome* para eu saber com quem estou conversando e te atender melhor.";
      await salvarContato(id, contato);
      return res.json({ reply: resposta });
    }

    // ── Etapa 1: captura o nome de forma simples ─────────────
    if (etapa === 1) {
      nome = capitalizarNome(msg);
      contato.nome  = nome;
      contato.etapa = 2;
      historico.push({ r: "c", t: msg });
      const ia = await chamarIA({ ...contato, etapa: 2 }, `Meu nome é ${nome}`);
      resposta = ia.resposta;
      if (ia.etapa) contato.etapa = ia.etapa;
      historico.push({ r: "b", t: resposta });
      contato.historico = historico.slice(-20);
      await salvarContato(id, contato);
      return res.json({ reply: resposta });
    }

    // ── Aguardando comprovante R$50 ──────────────────────────
    if (etapa === 7) {
      if (ehComprovante(msg)) {
        contato.etapa = 8;
        historico.push({ r: "c", t: "[comprovante enviado]" });
        const ia = await chamarIA({ ...contato, etapa: 8 }, "[cliente enviou comprovante de pagamento de R$50]");
        resposta = ia.resposta;
        if (ia.etapa) contato.etapa = ia.etapa;
        historico.push({ r: "b", t: resposta });
        contato.historico = historico.slice(-20);
        await salvarContato(id, contato);
        return res.json({ reply: resposta });
      }
      // Não é comprovante — IA responde (pode ser dúvida)
    }

    // ── Aguardando comprovante R$250 ─────────────────────────
    if (etapa === 10) {
      if (ehComprovante(msg)) {
        contato.etapa = 11;
        historico.push({ r: "c", t: "[comprovante enviado]" });
        const ia = await chamarIA({ ...contato, etapa: 11 }, "[cliente enviou comprovante de pagamento de R$250]");
        resposta = ia.resposta;
        if (ia.etapa) contato.etapa = ia.etapa;
        historico.push({ r: "b", t: resposta });
        contato.historico = historico.slice(-20);
        await salvarContato(id, contato);
        return res.json({ reply: resposta });
      }
    }

    // ── IA processa tudo o mais ──────────────────────────────
    historico.push({ r: "c", t: msg });
    const ia = await chamarIA(contato, msg);
    resposta = ia.resposta || "Desculpe, pode repetir?";

    // Atualiza etapa se IA avançou
    if (ia.etapa && ia.etapa >= contato.etapa) contato.etapa = ia.etapa;

    // Ações especiais
    if (ia.acao === "humano") {
      contato.modoHumano = true;
      resposta = "Um momento! 👋 Vou te conectar com um dos nossos especialistas agora...";
    }

    if (ia.acao === "aguardar_pix_50") {
      contato.etapa = 7;
      resposta = resposta.includes(BASE_URL) ? resposta : `${resposta}\n\n👇 *Link para pagamento:*\n${BASE_URL}/pix/50`;
    }

    if (ia.acao === "aguardar_pix_250") {
      contato.etapa = 10;
      resposta = resposta.includes(BASE_URL) ? resposta : `${resposta}\n\n👇 *Link para pagamento:*\n${BASE_URL}/pix/250`;
    }

    historico.push({ r: "b", t: resposta });
    contato.historico = historico.slice(-20);
    await salvarContato(id, contato);
    res.json({ reply: resposta });

  } catch (err) {
    console.error("Erro geral:", err.message);
    res.status(500).json({ reply: "Erro interno, tente novamente em instantes." });
  }
});

// ── Página Pix ────────────────────────────────────────────────
app.get("/pix/:valor", async (req, res) => {
  try {
    const valor = parseFloat(req.params.valor);
    if (isNaN(valor) || valor <= 0) return res.status(400).send("Valor inválido");
    const labels = { 50: "Diagnóstico de CPF", 250: "Entrada — Restauração de Crédito" };
    const html = await gerarPaginaPix(valor, labels[valor] || "Pagamento JustHelp");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) {
    res.status(500).send("Erro ao gerar QR Code");
  }
});

// ── Admin ─────────────────────────────────────────────────────
app.post("/assumir",  async (req, res) => { const c = await getContato(req.body.telefone); c.modoHumano = true;  await salvarContato(req.body.telefone, c); res.json({ ok: true }); });
app.post("/liberar",  async (req, res) => { const c = await getContato(req.body.telefone); c.modoHumano = false; await salvarContato(req.body.telefone, c); res.json({ ok: true }); });
app.post("/resetar",  async (req, res) => { await redis.del(`c:${req.body.telefone}`); res.json({ ok: true }); });
app.get("/contatos",  async (req, res) => {
  const keys = await redis.keys("c:*");
  if (!keys.length) return res.json([]);
  const vals = await Promise.all(keys.map(k => redis.get(k)));
  res.json(keys.map((k, i) => ({ id: k.replace("c:",""), ...vals[i] })).filter(c => !c.id.startsWith("teste_")));
});
app.get("/", (req, res) => res.send("🤖 JustHelp Bot v6 — Online ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ JustHelp Bot v6 na porta ${PORT}`));
