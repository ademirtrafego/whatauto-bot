const express = require("express");
const { Redis } = require("@upstash/redis");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const redis = new Redis({
  url: "https://gorgeous-warthog-98319.upstash.io",
  token: "gQAAAAAAAYAPAAIncDIwNjA2ZjEyZDUwZGQ0YTJmOGEyOWExMzk5ODIwOTI4MnAyOTgzMTk",
});

const DEEPSEEK_KEY = "sk-c05be12eec56495db38070240180103e";

// ── Estado ────────────────────────────────────────────────────
async function getContato(id) {
  return (await redis.get(`contato:${id}`)) || {
    etapa: 0, nome: "", dados: "", historico: [], modoHumano: false
  };
}
async function salvarContato(id, c) { await redis.set(`contato:${id}`, c); }

function identificarContato(body) {
  const phone  = (body.phone  || "").toString().trim();
  const sender = (body.sender || "").toString().trim();
  if (phone  && phone  !== "WhatsAuto app" && /\d/.test(phone))  return phone;
  if (sender && sender !== "WhatsAuto app") return sender;
  return "teste";
}

function capitalizarNome(t) {
  return t.trim().split(" ").map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

// ── Detecta se é imagem / comprovante ────────────────────────
function ehComprovante(msg, body) {
  if (!msg || msg.trim() === "") return true; // mensagem vazia = imagem enviada
  const lower = msg.toLowerCase();
  const palavras = ["comprovante","paguei","pago","fiz o pix","fiz pix","transferi",
    "enviado","efetuado","feito","realizei","concluído","concluido","aqui","ta","tá","pronto","segue","segura"];
  return palavras.some(p => lower.includes(p));
}

// ── Mensagens ─────────────────────────────────────────────────
const MSG = {
  1:  `Opa, tudo bem? 😊\n\nAntes de começarmos, me fala seu *nome* para eu saber com quem estou conversando e te atender melhor.`,
  2:  (n) => `Prazer, *${n}*! 😊\n\nMe conta um pouco da sua situação: você já sabe quais pendências estão travando o seu CPF hoje ou quer entender como funciona o nosso processo de restauração de crédito?`,
  3:  `Entendi... E você sabe dizer onde estão essas restrições? (Serasa, SPC, banco específico ou cartório?)\n\nVocê já tentou resolver isso de alguma forma ou é a primeira vez que busca ajuda especializada?`,
  4:  (n) => `${n}, vou ser bem transparente com você: nosso trabalho é diferente de uma renegociação comum. Nós *não pagamos a sua dívida* e nem fazemos acordos de parcelamento.\n\nO que fazemos é uma *análise técnica jurídica* para identificar irregularidades que permitam a remoção das restrições do seu perfil. Como nem todo caso é viável, o primeiro passo é sempre um diagnóstico real.`,
  5:  `Nesse diagnóstico faço um levantamento completo do seu CPF e te dou a real sobre o que pode (e o que não pode) ser feito.\n\nO serviço de análise custa *R$ 50*, mas fique tranquilo: se identificarmos que seu caso é viável e você decidir seguir com o processo completo, abato esses R$ 50 do valor final. É um investimento no seu nome. 💪`,
  6:  `Ótimo! Já posso abrir o sistema agora mesmo.\n\nMe envia seu *nome completo* e *CPF* para preparar a sua consulta. 📋`,
  7:  `Maravilha, já estou com a tela aberta! 🖥️\n\n💳 *Valor:* R$ 50\n🔑 *Chave Pix:* justhelpadv@gmail.com\n\nAssim que pagar, me envia o comprovante aqui. 📄`,
  8:  (n) => `Comprovante recebido! ✅ Obrigado, ${n}!\n\nJá iniciei sua análise detalhada. Aguarda um instante enquanto verifico cada pendência do seu CPF... 🔍`,
  9:  (n) => `${n}, terminei a análise! 📊\n\nIdentificamos as pendências que estão derrubando seu score e vi uma *viabilidade real* de atuação em boa parte delas.\n\nNão prometo que 100% sairá — trabalhamos com a verdade — mas o cenário é *bem favorável* para a sua restauração de crédito. ✅`,
  10: `Para darmos entrada no processo:\n\n✅ *Entrada:* R$ 250\n🏆 *Sucesso:* R$ 450 _(apenas após o êxito)_\n🎁 *Bônus:* Os R$ 50 do diagnóstico já estão abatidos!\n\nÉ o melhor caminho para você voltar a ter crédito no mercado. 💪`,
  11: `Perfeito! Para finalizar, me envia seus dados bancários ou chave Pix para a entrada de R$ 250:\n\n💳 *Chave Pix:* justhelpadv@gmail.com\n\nAssim que receber, dou entrada no processo imediatamente! ⚡`,
  12: `Entrada confirmada! 🎉\n\nSeu processo foi oficialmente aberto. Nossa equipe jurídica já está trabalhando no seu caso.\n\nVocê receberá atualizações aqui mesmo. Qualquer dúvida é só chamar! 💪`,
  humano: `Olá! 👋 Vou te conectar com um de nossos especialistas agora. Um momento...`,
};

// ── IA DeepSeek — quebra objeções ────────────────────────────
async function interpretarMensagem(etapa, nome, msg, historico) {
  const SYSTEM = `Você é um assistente de vendas especializado em restauração de crédito.
Analise a mensagem do cliente e responda SOMENTE com JSON válido.
Formato: {"acao": "avançar"|"objeção"|"humano", "resposta": "texto"}

- "avançar": cliente concordou/aceitou — siga para próxima etapa
- "objeção": cliente tem dúvida ou resistência — quebre a objeção e mantenha na etapa
- "humano": cliente está muito resistente, irritado ou pediu falar com pessoa real

GUIA DE OBJEÇÕES — Etapa ${etapa}:

${etapa === 5 ? `
- "é golpe/fraude" → Somos um escritório especializado. O diagnóstico é para mapear seu caso. Se não houver viabilidade, você saberá antes de investir mais. Trabalhamos com transparência total.
- "não tenho R$50" → R$50 é menos que uma consulta médica. E esse valor volta pra você se seguir com o processo. Quando você consegue separar esse valor?
- "preciso pensar" → Entendo! O que está te travando? Posso tirar qualquer dúvida agora mesmo.
- "já tentei e não funcionou" → O que tentou foi renegociação? Nosso trabalho é jurídico — completamente diferente. Muita gente que veio frustrada de outras tentativas conseguiu resultado conosco.
- "como funciona" → Explicar o processo jurídico de forma simples e reforçar a oferta do diagnóstico.` : `
- "muito caro" → Coloca na balança: com o nome limpo você volta a ter crédito, financiar, ter cartão. O investimento se paga em semanas. E os R$450 só paga SE tiver resultado.
- "não tenho dinheiro" → A entrada é só R$250. Você consegue organizar esse valor? Pensa que é um investimento que se paga com o primeiro crédito aprovado.
- "preciso falar com alguém" → Claro! Mas o diagnóstico já foi feito e está aqui. Qual a dúvida que você quer consultar? Posso responder agora.
- "e se não funcionar" → É exatamente por isso que o sucesso é R$450 SOMENTE após o resultado. Se não funcionar, você não paga os R$450. Risco praticamente zero.
- "quanto tempo demora" → A maioria dos clientes vê resultado em 30 a 90 dias. Já clientes com casos mais simples, em menos de 30 dias.`}

Nome do cliente: ${nome || "cliente"}`;

  const USER = `Histórico: ${historico.slice(-4).map(h=>`[${h.role}]: ${h.text}`).join(" | ")}
Mensagem atual: "${msg}"`;

  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat", max_tokens: 400,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: USER }]
      }),
    });
    const data = await r.json();
    const texto = data.choices?.[0]?.message?.content || "{}";
    return JSON.parse(texto.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.error("DeepSeek erro:", e.message);
    return { acao: "avançar", resposta: "" };
  }
}

// ── Webhook principal ────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const id      = identificarContato(req.body);
    const msg     = (req.body.message || "").trim();
    const msgLower = msg.toLowerCase();
    const contato = await getContato(id);
    let { etapa, nome, historico = [], modoHumano } = contato;
    let resposta  = "";

    console.log(`[${id}] etapa=${etapa} humano=${modoHumano} msg="${msg}"`);

    // ── Modo humano ativo — bot silencioso ──────────────────
    if (modoHumano) {
      return res.json({ reply: "" });
    }

    // ── Cliente pediu humano explicitamente ─────────────────
    if (["humano","atendente","pessoa","falar com alguém","falar com pessoa","quero humano"].some(p => msgLower.includes(p))) {
      contato.modoHumano = true;
      await salvarContato(id, contato);
      return res.json({ reply: MSG.humano });
    }

    // ── Fluxo principal ─────────────────────────────────────
    if (etapa === 0) {
      resposta = MSG[1]; contato.etapa = 1;

    } else if (etapa === 1) {
      nome = capitalizarNome(msg); contato.nome = nome;
      resposta = MSG[2](nome); contato.etapa = 2;

    } else if (etapa === 2) {
      historico.push({ role: "cliente", text: msg });
      resposta = MSG[3]; contato.etapa = 3;

    } else if (etapa === 3) {
      historico.push({ role: "cliente", text: msg });
      resposta = MSG[4](nome); contato.etapa = 4;

    } else if (etapa === 4) {
      historico.push({ role: "cliente", text: msg });
      resposta = MSG[5]; contato.etapa = 5;

    } else if (etapa === 5) {
      const ia = await interpretarMensagem(5, nome, msg, historico);
      if (ia.acao === "humano") {
        contato.modoHumano = true;
        resposta = MSG.humano;
      } else if (ia.acao === "avançar") {
        resposta = MSG[6]; contato.etapa = 6;
      } else {
        resposta = ia.resposta || "Entendo! 😊 O que está te travando? Pode me dizer que resolvo agora.";
      }

    } else if (etapa === 6) {
      contato.dados = msg;
      resposta = MSG[7]; contato.etapa = 7;

    } else if (etapa === 7) {
      // ── Leitura automática do comprovante ──────────────────
      if (ehComprovante(msg, req.body)) {
        // Confirma + já entrega o diagnóstico automaticamente
        resposta = MSG[8](nome) + "\n\n⏳ _Analisando seu CPF..._\n\n" + MSG[9](nome);
        contato.etapa = 10; // pula direto para oferta
      } else {
        resposta = `Ainda não recebi seu comprovante, ${nome}. 😊\n\nQuando pagar, é só me enviar a imagem ou o print do comprovante aqui. 📸`;
      }

    } else if (etapa === 10) {
      const ia = await interpretarMensagem(10, nome, msg, historico);
      if (ia.acao === "humano") {
        contato.modoHumano = true;
        resposta = MSG.humano;
      } else if (ia.acao === "avançar") {
        resposta = MSG[11]; contato.etapa = 11;
      } else {
        resposta = ia.resposta || "Entendo! Mas lembra: o sucesso é pago SOMENTE após o resultado. Qual é sua maior dúvida?";
      }

    } else if (etapa === 11) {
      if (ehComprovante(msg, req.body)) {
        resposta = MSG[12]; contato.etapa = 12;
      } else {
        resposta = `Assim que receber o comprovante de R$250, dou entrada imediatamente! 🚀\n\n💳 *Chave Pix:* justhelpadv@gmail.com`;
      }

    } else if (etapa === 12) {
      resposta = "Processo em andamento! ✅ Nossa equipe jurídica está trabalhando no seu caso. Qualquer novidade aviso aqui! 💪";

    } else {
      resposta = "Olá! Para iniciar um novo atendimento, me manda um *Oi*. 😊";
    }

    historico.push({ role: "bot", text: resposta });
    contato.historico = historico.slice(-10);
    await salvarContato(id, contato);
    res.json({ reply: resposta });

  } catch (err) {
    console.error("Erro:", err.message);
    res.status(500).json({ reply: "Erro interno, tente novamente em instantes." });
  }
});

// ── Assumir atendimento (humano entra) ───────────────────────
app.post("/assumir", async (req, res) => {
  const { telefone } = req.body;
  if (!telefone) return res.status(400).json({ erro: "Telefone obrigatório" });
  const c = await getContato(telefone);
  c.modoHumano = true;
  await salvarContato(telefone, c);
  res.json({ ok: true, mensagem: `Você assumiu o atendimento de ${telefone}. Bot pausado.` });
});

// ── Liberar atendimento (bot volta) ──────────────────────────
app.post("/liberar", async (req, res) => {
  const { telefone } = req.body;
  if (!telefone) return res.status(400).json({ erro: "Telefone obrigatório" });
  const c = await getContato(telefone);
  c.modoHumano = false;
  await salvarContato(telefone, c);
  res.json({ ok: true, mensagem: `Bot reativado para ${telefone}.` });
});

// ── Avançar para etapa 9 manualmente ─────────────────────────
app.post("/avancar", async (req, res) => {
  const { telefone } = req.body;
  if (!telefone) return res.status(400).json({ erro: "Telefone obrigatório" });
  const c = await getContato(telefone);
  c.etapa = 9;
  await salvarContato(telefone, c);
  res.json({ ok: true });
});

// ── Resetar contato ───────────────────────────────────────────
app.post("/resetar", async (req, res) => {
  const { telefone } = req.body;
  if (!telefone) return res.status(400).json({ erro: "Telefone obrigatório" });
  await redis.del(`contato:${telefone}`);
  res.json({ ok: true });
});

// ── Listar contatos ───────────────────────────────────────────
app.get("/contatos", async (req, res) => {
  const keys = await redis.keys("contato:*");
  if (!keys.length) return res.json([]);
  const vals = await Promise.all(keys.map(k => redis.get(k)));
  res.json(keys.map((k, i) => ({ id: k.replace("contato:",""), ...vals[i] })));
});

app.get("/", (req, res) => res.send("🤖 Bot Restauração de Crédito v4 — Online ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Bot v4 rodando na porta ${PORT}`));
