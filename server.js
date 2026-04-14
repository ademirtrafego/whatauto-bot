const express = require("express");
const { Redis } = require("@upstash/redis");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const redis = new Redis({
  url: "https://gorgeous-warthog-98319.upstash.io",
  token: "gQAAAAAAAYAPAAIncDIwNjA2ZjEyZDUwZGQ0YTJmOGEyOWExMzk5ODIwOTI4MnAyOTgzMTk",
});

async function getContato(id) {
  const dados = await redis.get(`contato:${id}`);
  return dados || { etapa: 0, nome: "", dados: "" };
}

async function salvarContato(id, estado) {
  await redis.set(`contato:${id}`, estado);
}

function identificarContato(body) {
  const phone = (body.phone || "").toString().trim();
  const sender = (body.sender || "").toString().trim();
  if (phone && phone !== "WhatsAuto app" && /\d/.test(phone)) return phone;
  if (sender && sender !== "WhatsAuto app") return sender;
  return "teste";
}

const ETAPAS = {
  1: `Opa, tudo bem? 😊\n\nAntes de começarmos, me fala seu *nome* para eu saber com quem estou conversando e te atender melhor.`,
  2: (nome) => `Prazer, *${nome}*! 😊\n\nMe conta um pouco da sua situação: você já sabe quais pendências estão travando o seu CPF hoje ou quer entender como funciona o nosso processo de restauração de crédito?`,
  3: `Entendi... E você sabe dizer onde estão essas restrições? (Se é no Serasa, SPC, algum banco específico ou cartório...)\n\nAlém disso, você já tentou resolver isso de alguma forma ou essa é a primeira vez que busca ajuda especializada?`,
  4: (nome) => `${nome}, vou ser bem transparente com você: nosso trabalho aqui é diferente de uma renegociação comum. Nós *não pagamos a sua dívida* e nem fazemos acordos de parcelamento.\n\nO que nós fazemos é uma *análise técnica jurídica* para identificar irregularidades que permitam a remoção dessas restrições do seu perfil. Como nem todo caso permite isso, o primeiro passo é sempre um diagnóstico real da sua situação.`,
  5: `Nesse diagnóstico, eu faço um levantamento completo do seu CPF e te dou a real sobre o que pode (e o que não pode) ser feito.\n\nEsse serviço de análise custa *R$ 50*, mas fique tranquilo: se a gente identificar que seu caso é viável e você decidir seguir com o processo completo, eu abato esses R$ 50 do valor final. É um investimento no seu nome. 💪`,
  6: `Se fizer sentido para você, já posso abrir o sistema agora mesmo.\n\nMe envia seu *nome completo* e *CPF* para eu preparar a sua consulta aqui. 📋`,
  7: `Maravilha, já estou com a tela aberta! 🖥️\n\n💳 *Valor:* R$ 50\n🔑 *Chave Pix:* justhelpadv@gmail.com\n\nAssim que realizar o pagamento, me envia o comprovante aqui para eu anexar e já gerar o seu relatório. 📄`,
  8: `Comprovante recebido! ✅\n\nJá dei início à sua análise detalhada. Vou analisar cada ponto com cuidado e em breve te mando o diagnóstico completo com as possibilidades reais para o seu caso. 🔍`,
  9: (nome) => `${nome}, terminei a análise do seu CPF. Identificamos as pendências que estão derrubando seu score. 📊\n\nA boa notícia é que vi uma *viabilidade real* de atuação em boa parte dessas restrições. Não consigo te prometer que 100% sairá (pois trabalhamos com a verdade), mas o cenário é *bem favorável* para a sua restauração de crédito.`,
  10: `Para a gente dar entrada no processo e buscar a liberação do seu nome, as condições são:\n\n✅ *Entrada:* R$ 250\n🏆 *Sucesso:* R$ 450 _(pagos apenas no final, após o êxito)_\n\n🎁 *Bônus:* Já estou abatendo os R$ 50 que você pagou na análise, ok?\n\nÉ o melhor caminho para você voltar a ter crédito no mercado. 💪`,
  11: `Se você estiver de acordo, já posso dar andamento na documentação *hoje mesmo* para ganharmos tempo. ⚡\n\nPosso seguir por aqui?`,
};

function contemAceite(msg) {
  return ["sim","pode","quero","ok","tudo bem","vamos","vai","bora","certo","claro","aceito","yes","isso","ótimo","otimo","s"].some(p => msg.includes(p));
}

function capitalizarNome(texto) {
  return texto.trim().split(" ").map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

app.post("/webhook", async (req, res) => {
  try {
    const id = identificarContato(req.body);
    const msg = (req.body.message || "").trim();
    const msgLower = msg.toLowerCase();
    const contato = await getContato(id);
    let { etapa, nome } = contato;
    let resposta = "";

    console.log(`[${id}] etapa=${etapa} msg="${msg}"`);

    if      (etapa === 0)  { resposta = ETAPAS[1]; contato.etapa = 1; }
    else if (etapa === 1)  { nome = capitalizarNome(msg); contato.nome = nome; resposta = ETAPAS[2](nome); contato.etapa = 2; }
    else if (etapa === 2)  { resposta = ETAPAS[3]; contato.etapa = 3; }
    else if (etapa === 3)  { resposta = ETAPAS[4](nome); contato.etapa = 4; }
    else if (etapa === 4)  { resposta = ETAPAS[5]; contato.etapa = 5; }
    else if (etapa === 5)  {
      if (contemAceite(msgLower)) { resposta = ETAPAS[6]; contato.etapa = 6; }
      else { resposta = "Entendo! 😊 Se tiver dúvida, pode perguntar. Sempre que quiser, é só falar que dou início à sua consulta!"; }
    }
    else if (etapa === 6)  { contato.dados = msg; resposta = ETAPAS[7]; contato.etapa = 7; }
    else if (etapa === 7)  { resposta = ETAPAS[8]; contato.etapa = 8; }
    else if (etapa === 9)  { resposta = ETAPAS[10]; contato.etapa = 10; }
    else if (etapa === 10) {
      if (contemAceite(msgLower)) { resposta = ETAPAS[11]; contato.etapa = 11; }
      else { resposta = "Sem problema! 😊 Se tiver dúvida sobre o processo ou valores, pode me perguntar!"; }
    }
    else if (etapa === 11) { resposta = "Perfeito! ✅ Já estou organizando sua documentação. Em breve entro em contato!"; contato.etapa = 12; }
    else { resposta = "Olá! Para iniciar um novo atendimento, me manda um *Oi*. 😊"; }

    await salvarContato(id, contato);
    res.json({ reply: resposta });
  } catch (err) {
    console.error("Erro:", err.message);
    res.status(500).json({ reply: "Erro interno, tente novamente." });
  }
});

app.post("/avancar", async (req, res) => {
  const { telefone } = req.body;
  if (!telefone) return res.status(400).json({ erro: "Telefone obrigatório" });
  const contato = await getContato(telefone);
  if (contato.etapa !== 8) return res.json({ aviso: `Contato está na etapa ${contato.etapa}, esperado 8.` });
  contato.etapa = 9;
  await salvarContato(telefone, contato);
  res.json({ ok: true, proximaMensagem: ETAPAS[9](contato.nome || "") });
});

app.post("/resetar", async (req, res) => {
  const { telefone } = req.body;
  if (!telefone) return res.status(400).json({ erro: "Telefone obrigatório" });
  await redis.del(`contato:${telefone}`);
  res.json({ ok: true });
});

app.get("/contatos", async (req, res) => {
  const keys = await redis.keys("contato:*");
  if (!keys.length) return res.json([]);
  const vals = await Promise.all(keys.map(k => redis.get(k)));
  res.json(keys.map((k, i) => ({ id: k.replace("contato:",""), ...vals[i] })));
});

app.get("/", (req, res) => res.send("🤖 Bot Restauração de Crédito — Online ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor na porta ${PORT}`));
