const express = require("express");
const { Redis } = require("@upstash/redis");
const QRCode   = require("qrcode");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────────────────────
//  CONFIGURAÇÃO
// ─────────────────────────────────────────────────────────────
const redis = new Redis({
  url:   "https://gorgeous-warthog-98319.upstash.io",
  token: "gQAAAAAAAYAPAAIncDIwNjA2ZjEyZDUwZGQ0YTJmOGEyOWExMzk5ODIwOTI4MnAyOTgzMTk",
});

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : process.env.BASE_URL || "https://whatauto-bot-production.up.railway.app";

console.log("✅ JustHelp Bot | " + BASE_URL);

// ─────────────────────────────────────────────────────────────
//  IDENTIFICAÇÃO DO CONTATO
//  Garante que cada número tenha estado 100% isolado
// ─────────────────────────────────────────────────────────────
function identificarContato(body) {
  // Tenta extrair o número de todas as formas possíveis
  const candidatos = [
    body.phone,
    body.sender,
    body.from,
    body.number,
    body.contact,
  ].filter(Boolean).map(v => String(v).trim());

  for (const c of candidatos) {
    // Aceita apenas se tiver pelo menos 8 dígitos (número real)
    const digitos = c.replace(/\D/g, "");
    if (digitos.length >= 8 && c !== "WhatsAuto app") {
      return digitos;
    }
  }

  // Fallback único por timestamp — evita misturar contatos
  return `anonimo_${Date.now()}`;
}

// ─────────────────────────────────────────────────────────────
//  ESTADO — cada número tem estado completamente isolado
// ─────────────────────────────────────────────────────────────
function estadoInicial() {
  return {
    etapa: 0,
    nome: "",
    cpf: "",
    dados: "",
    motivo: "",
    modoHumano: false,
    ultimaMsg: null,
    reativacoes: 0,
    processStart: null,
    upd7: false,
    upd15: false,
    upd25: false,
  };
}

async function lerContato(id) {
  try {
    const dados = await redis.get(`lead:${id}`);
    if (!dados) return estadoInicial();
    // Garante que todos os campos existam (compatibilidade)
    return { ...estadoInicial(), ...dados };
  } catch (e) {
    console.error(`[${id}] Redis leitura:`, e.message);
    return estadoInicial();
  }
}

async function salvarContato(id, estado) {
  try {
    await redis.set(`lead:${id}`, estado);
  } catch (e) {
    console.error(`[${id}] Redis escrita:`, e.message);
  }
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
function capitalizar(t) {
  return (t || "").trim().split(" ")
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function eSaudacao(msg) {
  return /^(oi|ol[aá]|oii+|bom dia|boa tarde|boa noite|hello|hi|hey|opa|salve|al[oô]|menu|inicio|start|começar|comecar)[\s!?.]*$/i.test(msg.trim());
}

function eComprovante(msg) {
  if (!msg || msg.trim() === "") return true; // imagem = msg vazia
  return /paguei|pago|fiz|transferi|enviado|efetuado|feito|pronto|segue|comprovante|print|t[aá] aqui/i.test(msg);
}

function numeros(msg) {
  return msg.replace(/[^0-9]/g, "");
}

// ─────────────────────────────────────────────────────────────
//  PIX — página de pagamento
// ─────────────────────────────────────────────────────────────
function pf(id, v) { return `${id}${String(v.length).padStart(2, "0")}${v}`; }
function pcrc(s) {
  let c = 0xFFFF;
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) : (c << 1);
  }
  return (c & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
}
function pixPayload(valor) {
  const ma = pf("00", "BR.GOV.BCB.PIX") + pf("01", "justhelpadv@gmail.com");
  const p = pf("00", "01") + pf("01", "12") + pf("26", ma) + pf("52", "0000") +
    pf("53", "986") + pf("54", Number(valor).toFixed(2)) + pf("58", "BR") +
    pf("59", "JustHelp Adv") + pf("60", "Sao Paulo") + pf("62", pf("05", "JUSTHELPADV")) + "6304";
  return p + pcrc(p);
}
async function paginaPix(valor) {
  const code = pixPayload(valor);
  const qr = await QRCode.toDataURL(code, { width: 260, margin: 2 });
  const label = valor == 50 ? "Diagnóstico de CPF" : "Entrada — Restauração de Crédito";
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagar R$ ${Number(valor).toFixed(2).replace(".", ",")} — JustHelp</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}.card{background:#fff;border-radius:20px;padding:28px 22px;max-width:360px;width:100%;text-align:center}.logo{background:#1D7874;color:#fff;border-radius:10px;padding:8px 18px;display:inline-block;font-weight:700;font-size:17px;margin-bottom:14px}.valor{font-size:36px;font-weight:700;color:#1D7874}.sub{color:#888;font-size:13px;margin-bottom:18px}.qr{background:#f8f9fa;border-radius:14px;padding:14px;display:inline-block;margin-bottom:16px}.qr img{display:block;width:230px;height:230px}.steps{text-align:left;margin-bottom:14px}.step{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#444}.step:last-child{border:none}.n{background:#1D7874;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px}.copia{background:#f8f9fa;border-radius:10px;padding:10px;font-family:monospace;font-size:10px;color:#333;word-break:break-all;margin-bottom:10px;text-align:left;line-height:1.5}.btn{width:100%;padding:14px;border-radius:10px;border:none;font-size:15px;font-weight:700;cursor:pointer;background:#1D7874;color:#fff}.ok{background:#22c55e}.aviso{font-size:11px;color:#aaa;margin-top:12px}</style></head><body><div class="card"><div class="logo">JustHelp</div><div class="valor">R$ ${Number(valor).toFixed(2).replace(".", ",")}</div><div class="sub">${label}</div><div class="qr"><img src="${qr}" alt="QR Pix"></div><div class="steps"><div class="step"><span class="n">1</span><span>Abra seu banco ou app</span></div><div class="step"><span class="n">2</span><span>Pix → QR Code ou Copia e Cola</span></div><div class="step"><span class="n">3</span><span>Confirme e pague</span></div></div><div class="copia" id="cod">${code}</div><button class="btn" id="btn" onclick="copy()">📋 Copiar código Pix</button><div class="aviso">⚠️ Após pagar, volte ao WhatsApp e envie o comprovante.</div></div><script>function copy(){navigator.clipboard.writeText(document.getElementById('cod').textContent).then(()=>{const b=document.getElementById('btn');b.textContent='✅ Copiado!';b.classList.add('ok');setTimeout(()=>{b.textContent='📋 Copiar código Pix';b.classList.remove('ok')},3000)})}</script></body></html>`;
}

// ─────────────────────────────────────────────────────────────
//  MENSAGENS
// ─────────────────────────────────────────────────────────────
const M = {

  // FASE 1 — Abertura
  inicio: () => `Olá! 👋 Seja bem-vindo à *JustHelp Assessoria Jurídica*.\n\nAntes de tudo, me fala seu *nome* pra eu te atender do jeito certo. 😊`,

  menu: (n) => `Prazer, *${n}*! 😊\n\nComo posso te ajudar?\n\n1️⃣ Quero limpar meu nome\n2️⃣ Entender como funciona`,

  como_funciona: () => `Boa pergunta! 💡\n\nMuita gente confunde nosso trabalho com renegociação — mas são coisas completamente diferentes.\n\nNós fazemos uma *análise jurídica* das suas dívidas. Identificamos irregularidades como:\n\n• Juros acima do permitido por lei\n• Dívidas com prazo de prescrição vencido\n• Cobranças indevidas ou duplicadas\n\nCom isso, entramos juridicamente pedindo a *remoção dos apontamentos* dos órgãos de restrição (Serasa, SPC e outros). Você volta a ter crédito no mercado! ⚖️\n\n*Bônus:* após a remoção, trabalhamos também no *aumento do seu score*. 📈\n\n1️⃣ Quero fazer um diagnóstico do meu CPF\n2️⃣ Voltar ao menu`,

  onde: () => `Entendido! Me conta: *onde estão suas restrições?*\n\n1️⃣ Serasa\n2️⃣ SPC\n3️⃣ Banco específico\n4️⃣ Cartório\n5️⃣ Não sei ao certo`,

  tempo: () => `Certo! Há quanto tempo você está com restrições?\n\n1️⃣ Menos de 1 ano\n2️⃣ Entre 1 e 3 anos\n3️⃣ Mais de 3 anos`,

  tentou: () => `Você já tentou resolver antes?\n\n1️⃣ Sim, já tentei renegociar ou parcelar\n2️⃣ Não, é minha primeira vez buscando ajuda`,

  resp_sim: (n) => `Entendo, ${n}. E saiba que não é culpa sua — renegociação *não resolve*, porque a dívida continua lá.\n\nNosso trabalho é diferente: encontramos os *erros jurídicos* na dívida e pedimos a remoção dos apontamentos. Muita gente que veio frustrada de outras tentativas conseguiu resultado conosco. 💪`,

  resp_nao: (n) => `Boa notícia, ${n}: você está no lugar certo desde o início! Vamos dar um passo seguro e inteligente. 😊`,

  ancora: () => `Antes de continuarmos, me conta: *por que limpar o nome é importante pra você agora?* 🎯\n\n1️⃣ Quero fazer um financiamento ou empréstimo\n2️⃣ Quero ter cartão de crédito\n3️⃣ Preciso para uma oportunidade de trabalho\n4️⃣ Quero ter crédito no comércio\n5️⃣ Quero me livrar dessa situação de vez`,

  ancora_resp: (motivo) => `Entendido! *${motivo}* — esse é um motivo muito válido. 💪\n\nE saiba: quanto antes você agir, mais rápido esse objetivo vira realidade. Vamos juntos nessa?`,

  valor_divida: () => `Mais uma coisa: qual é o valor *aproximado* das suas dívidas?\n\n1️⃣ Até R$ 1.000\n2️⃣ Entre R$ 1.000 e R$ 5.000\n3️⃣ Entre R$ 5.000 e R$ 20.000\n4️⃣ Acima de R$ 20.000\n5️⃣ Não sei ao certo`,

  valor_resp: (f) => `${f} Anotado! Isso nos ajuda a focar a análise nos pontos certos. 🔍`,

  depoimentos: () => `Antes de continuar, veja o que alguns clientes dizem: 💬\n\n⭐ *"Fiquei 4 anos com o nome sujo. Em 22 dias o processo foi concluído e consegui meu cartão."* — Carlos, SP\n\n⭐ *"Não acreditei no início, mas funcionou. Nome limpo em 18 dias. Já fiz meu financiamento."* — Fernanda, RJ\n\n⭐ *"Tentei renegociar por anos. Com a JustHelp saiu em menos de 1 mês."* — Roberto, MG`,

  // FASE 2 — Posicionamento e oferta diagnóstico
  posicionamento: (n) => `${n}, deixa eu ser direto com você. ⚖️\n\nHoje, com o nome sujo, você perde:\n• Acesso a crédito e financiamentos\n• Cartão de crédito\n• Oportunidades de trabalho que pedem CPF limpo\n\nIsso tem um custo invisível *muito maior* que qualquer dívida.\n\nNosso processo jurídico age nas *irregularidades* — e muitas têm. O primeiro passo é um *diagnóstico completo do seu CPF*.\n\nEsse diagnóstico custa *R$ 50* — e se você seguir com o processo, esse valor já vem *abatido*. 💡\n\nO que acha?\n\n1️⃣ Quero fazer o diagnóstico agora\n2️⃣ Tenho dúvidas sobre o valor\n3️⃣ Não sei se é confiável\n4️⃣ Já tentei antes e não funcionou\n5️⃣ Quero entender melhor como funciona\n6️⃣ Preciso pensar um pouco`,

  obj_valor: () => `Entendo a dúvida! Mas pensa comigo: 🤔\n\n💡 R$ 50 é menos que uma consulta médica\n💡 Se não houver viabilidade, você *saberá antes* de gastar mais\n💡 Se seguir, esse R$ 50 já vem *abatido* do valor final\n\n1️⃣ Faz sentido, quero o diagnóstico\n2️⃣ Mesmo assim não tenho o valor agora`,

  obj_sem_50: () => `Tudo bem! R$ 50 parece pouco, mas se não tiver no momento, sem pressão. 😊\n\nQuando conseguir separar, é só mandar um *Oi* aqui.\n\n1️⃣ Na verdade consigo sim — quero fazer agora\n2️⃣ Vou guardar e volto em breve`,

  obj_confiavel: () => `Sua desconfiança é *totalmente válida* — tem muita fraude por aí. 🙏\n\nPor isso o diagnóstico de R$ 50 existe: para você ver a viabilidade *antes* de investir mais.\n\nSe não houver caminho jurídico, você saberá e não gasta mais nada.\n\n1️⃣ Faz sentido, vou fazer o diagnóstico\n2️⃣ Quero saber mais antes de decidir`,

  obj_ja_tentou: (n) => `${n}, o que você tentou antes foi *renegociação ou parcelamento*, certo?\n\nEsse modelo não funciona porque a dívida continua existindo.\n\nNosso modelo é *jurídico*: a gente encontra os erros legais e pede a *remoção dos apontamentos*. É completamente diferente. 💪\n\n1️⃣ Entendi, quero tentar esse caminho\n2️⃣ Ainda tenho dúvidas`,

  obj_entender: () => `Claro! Em 3 passos simples: 📋\n\n*1.* Diagnóstico do CPF (R$ 50) — identificamos restrições e irregularidades\n*2.* Se viável, abrimos o processo jurídico (entrada R$ 250)\n*3.* Nossa equipe pede a remoção — você paga R$ 450 de êxito *somente quando o nome estiver limpo*\n\n🎁 Bônus: trabalhamos também no aumento do seu score! 📈\n\n1️⃣ Entendi! Quero começar\n2️⃣ Ainda tenho dúvida`,

  obj_pensar_50: () => `Claro, sem pressão! 😊\n\nMas o que está te travando?\n\n1️⃣ Questão financeira no momento\n2️⃣ Não confio totalmente ainda\n3️⃣ Quero consultar alguém antes\n4️⃣ Vou pensar e retorno depois`,

  urgencia: () => `⚠️ *Atenção:* nossa equipe tem capacidade limitada de análises por dia.\n\nNo momento tenho *1 vaga disponível*. Se não confirmar hoje, não garanto para amanhã.\n\n`,

  coletar_dados: () => `Ótimo, vamos lá! 🎉\n\nPara preparar seu diagnóstico, me envia seu *nome completo* e *CPF* aqui. 📋`,

  // FASE 3 — Pagamento R$50 e diagnóstico
  enviar_pix50: (url) => `Perfeito! Preparei tudo pra você. 🖥️\n\n💳 *Valor:* R$ 50\n\n👇 *Clique aqui para pagar (QR Code + Copia e Cola):*\n${url}\n\nAssim que pagar, é só me enviar qualquer mensagem ou o comprovante aqui. 📸`,

  analisando_1: (n) => `✅ Pagamento confirmado! Obrigado, ${n}!\n\nJá iniciei sua análise detalhada. Aguarda um momento... 🔍`,
  analisando_2: () => `🔎 *Verificando Serasa...*\n_consultando base de dados..._`,
  analisando_3: () => `🔎 *Verificando SPC e bancos associados...*\n_analisando histórico..._`,
  analisando_4: () => `🔎 *Verificando irregularidades jurídicas...*\n_identificando possibilidades..._`,

  diagnostico: (n) => `📊 *DIAGNÓSTICO CONCLUÍDO — ${n.toUpperCase()}*\n\n✅ Restrições identificadas\n✅ Irregularidades detectadas\n✅ Viabilidade jurídica: *FAVORÁVEL*\n\n${n}, o cenário para restauração do seu crédito é *positivo*. Identificamos pontos que permitem atuação jurídica para remoção dos apontamentos.\n\nQuer que eu explique como funciona o processo completo?\n\n1️⃣ Sim, quero saber o próximo passo\n2️⃣ Tenho dúvidas sobre o resultado`,

  obj_diag: (n) => `${n}, deixa eu ser mais claro. 😊\n\nO diagnóstico identificou que suas restrições possuem características que permitem atuação jurídica — análise de prazo, origem da dívida e conformidade legal das cobranças.\n\nNão garantimos 100% em todos os itens (trabalhamos com honestidade), mas o cenário é *favorável* para uma parte significativa.\n\n1️⃣ Entendi, quero avançar\n2️⃣ Ainda tenho dúvidas`,

  // FASE 4 — Oferta processo completo
  oferta_processo: (n) => `${n}, para darmos entrada e buscarmos a *liberação do seu nome*: ⚖️\n\n▶ *Entrada:* R$ 250\n▶ *Êxito:* R$ 450 _(pago SOMENTE após resultado)_\n▶ *Bônus:* R$ 50 do diagnóstico já abatidos!\n▶ *Prazo:* até *30 dias úteis*\n▶ *Bônus:* aumento de score incluído! 📈\n▶ *Contrato:* formal e digital\n\n⚠️ Se não funcionar, você *não paga* os R$ 450.\n\n1️⃣ Quero entrar no processo agora\n2️⃣ O valor está alto para mim\n3️⃣ E se não funcionar?\n4️⃣ Quanto tempo demora?\n5️⃣ Como funciona o contrato?\n6️⃣ Preciso pensar um pouco`,

  obj_caro: (n) => `${n}, entendo. Mas coloca na balança: 💰\n\nCom o nome limpo você volta a ter cartão, financiamentos e crédito. Isso representa *muito mais* que R$ 250 por mês. E os R$ 450 de êxito só pagam *depois que seu nome já estiver limpo*.\n\n1️⃣ Faz sentido, quero entrar\n2️⃣ Realmente não tenho o valor agora`,

  obj_sem_250: () => `Tudo bem! Quando estiver pronto, manda um *Oi* que retomamos. 😊\n\nSeu diagnóstico fica salvo aqui.\n\n1️⃣ Na verdade consigo sim — quero entrar\n2️⃣ Vou organizar e volto`,

  obj_falhar: () => `Ótima pergunta — e a resposta vai te tranquilizar! 😊\n\nOs R$ 450 são cobrados *SOMENTE após o resultado*. Se não funcionar, você *não paga esse valor*.\n\n• Você arrisca: R$ 250 de entrada\n• Nós arriscamos: todo o trabalho jurídico\n• Só cobramos o êxito quando você ganhar 💪\n\n1️⃣ Entendi, quero entrar\n2️⃣ Ainda tenho dúvida`,

  obj_tempo: () => `*Prazo de até 30 dias úteis.* ⏱️\n\nA maioria resolve antes. Casos simples, menos de 15 dias.\n\nAssim que você entrar, o processo começa *no mesmo dia*. ⚡\n\n1️⃣ Ótimo, quero começar agora\n2️⃣ Preciso pensar mais`,

  obj_contrato: () => `Trabalhamos com *total transparência*. 📄\n\nApós o pagamento da entrada, você recebe um *contrato digital* com:\n\n✅ Prazo garantido (30 dias úteis)\n✅ Cláusula de êxito (só paga se funcionar)\n✅ Todas as obrigações das partes\n\nPara o contrato precisamos do RG e CPF — enviados aqui mesmo pelo WhatsApp.\n\n1️⃣ Entendi, quero assinar\n2️⃣ Tenho mais dúvidas`,

  obj_pensar_250: (n) => `${n}, sem pressão! Mas o que está te travando?\n\n1️⃣ Questão financeira no momento\n2️⃣ Ainda tenho dúvida sobre o processo\n3️⃣ Quero consultar alguém antes\n4️⃣ Vou pensar e retorno depois`,

  // FASE 5 — Pagamento R$250
  enviar_pix250: (url) => `Ótima decisão, vamos lá! 🎉\n\n💳 *Entrada: R$ 250*\n\n👇 *Clique aqui para pagar (QR Code + Copia e Cola):*\n${url}\n\nAssim que pagar, me envia o comprovante aqui. 📸`,

  // FASE 5 — Documentos para contrato
  pedir_rg: (n) => `*Entrada confirmada!* ✅ Obrigado, ${n}!\n\nAgora vamos formalizar seu *contrato*. 📄\n\nPreciso de uma foto do seu *RG — frente e verso*.\n\n📸 _Envie a foto aqui agora._`,

  pedir_cpf_doc: () => `Perfeito! ✅\n\nAgora me envia uma foto do seu *CPF*. 📸`,

  docs_ok: (n) => `Documentação recebida! ✅\n\n${n}, estamos preparando seu contrato com base nas informações coletadas.`,

  // FASE 6 — Fechamento
  fechamento: (n) => `🎉 *${n}, seu processo foi OFICIALMENTE ABERTO!*\n\nResumo do que acontece agora:\n\n⚖️ Nossa equipe jurídica já está trabalhando na *remoção dos seus apontamentos*\n📅 Prazo de até *30 dias úteis* para resultado\n📈 *Bônus:* aumento de score incluso\n📄 Contrato será enviado em breve\n💰 Os R$ 450 de êxito só são cobrados *após* o resultado\n\nVocê tomou a decisão certa hoje! 💪\n\nQualquer dúvida ao longo do processo, é só mandar mensagem aqui. Estamos com você! 😊`,

  // Atualizações durante o processo
  upd_d7:  (n) => `Olá, *${n}*! 👋\n\nSeu processo está em andamento há 7 dias. Nossa equipe jurídica está trabalhando nas análises. ⚖️\n\nQualquer dúvida é só chamar! 😊`,
  upd_d15: (n) => `*${n}*, atualização do seu processo! 📋\n\nJá se passaram 15 dias. Estamos na fase de análise jurídica das suas restrições. Em breve teremos novidades! 💪`,
  upd_d25: (n) => `*${n}*, estamos na reta final! 🏁\n\nSeu processo está há 25 dias em andamento. Nossa equipe está concluindo os procedimentos. Em breve o resultado chegará. 😊`,

  // Reativação
  reativacao_1: (n) => `Oi, *${n}*! 😊 Vi que você ficou com dúvidas na última vez.\n\nAinda tenho *vaga disponível hoje*. Posso retomar de onde paramos?\n\n1️⃣ Sim, quero continuar\n2️⃣ Ainda preciso pensar`,

  reativacao_2: (n) => `*${n}*, só passando para lembrar: seu diagnóstico ainda pode ser feito hoje. 🔍\n\nCada dia com restrição é um dia sem crédito. Posso te ajudar agora?\n\n1️⃣ Sim, vamos lá\n2️⃣ Não tenho interesse`,

  // Menu retorno
  menu_retorno: (n) => `Certo, *${n}*! 😊 Por onde quer continuar?\n\n1️⃣ Quero fazer o diagnóstico do meu CPF\n2️⃣ Entender melhor como funciona\n3️⃣ Tenho dúvidas antes de decidir`,

  // Menu de dúvidas — categorias
  menu_categorias: () => `Pode tirar todas as dúvidas! 😊 Escolha a categoria:\n\n1️⃣ Sobre o serviço\n2️⃣ Confiança e segurança\n3️⃣ Valores e prazo\n4️⃣ Contrato e garantias\n5️⃣ Sobre o resultado\n6️⃣ Sobre o diagnóstico de R$ 50\n\n7️⃣ Já tirei minhas dúvidas — quero começar!`,

  cat1: () => `*Sobre o serviço:* ⚖️\n\n1️⃣ O que exatamente vocês fazem?\n2️⃣ Preciso pagar a dívida?\n3️⃣ Funciona pra qualquer tipo de dívida?\n4️⃣ E se eu tiver muitas dívidas?\n5️⃣ Funciona pra dívida antiga ou recente?\n\n0️⃣ Voltar às categorias`,
  cat2: () => `*Confiança e segurança:* 🔒\n\n1️⃣ Como sei que não é golpe?\n2️⃣ Vocês são um escritório registrado?\n3️⃣ Já atenderam outros clientes?\n4️⃣ Por que cobram só R$ 50 no início?\n5️⃣ Meus dados ficam seguros?\n\n0️⃣ Voltar às categorias`,
  cat3: () => `*Valores e prazo:* 💰\n\n1️⃣ Quanto custa no total?\n2️⃣ Quanto tempo demora?\n3️⃣ Quando começa após o pagamento?\n4️⃣ Se não funcionar, perco tudo?\n5️⃣ Posso parcelar?\n\n0️⃣ Voltar às categorias`,
  cat4: () => `*Contrato e garantias:* 📄\n\n1️⃣ Como funciona o contrato?\n2️⃣ Tenho garantia por escrito?\n3️⃣ Posso cancelar depois?\n4️⃣ O que preciso enviar?\n5️⃣ Como recebo o contrato?\n\n0️⃣ Voltar às categorias`,
  cat5: () => `*Sobre o resultado:* 🏆\n\n1️⃣ Como fico sabendo do resultado?\n2️⃣ Remove de todos os órgãos?\n3️⃣ Como funciona o bônus de score?\n4️⃣ O que acontece com a dívida depois?\n5️⃣ Posso pedir crédito logo após?\n\n0️⃣ Voltar às categorias`,
  cat6: () => `*Sobre o diagnóstico de R$ 50:* 🔍\n\n1️⃣ O que é o diagnóstico exatamente?\n2️⃣ O R$ 50 é devolvido?\n3️⃣ E se não houver viabilidade?\n4️⃣ O diagnóstico é imediato?\n5️⃣ Preciso enviar documentos?\n\n0️⃣ Voltar às categorias`,

  // Respostas das dúvidas
  r1_1: () => `Analisamos juridicamente suas dívidas em busca de irregularidades. Quando encontramos, entramos com pedido jurídico para *remover os apontamentos* do Serasa, SPC e outros. Resultado: seu nome limpo e crédito disponível. 🎯`,
  r1_2: () => `*Não precisa pagar a dívida.* 🙅\n\nRemovemos os *apontamentos* — os registros negativos nos órgãos. A dívida pode continuar existindo juridicamente, mas sem te impedir de ter crédito. ✅`,
  r1_3: () => `Trabalhamos com a maioria: *cartão de crédito, bancos, financeiras, lojas, operadoras de telefone* e outros. O diagnóstico identifica quais têm viabilidade no seu caso. 🔍`,
  r1_4: () => `Quanto mais restrições, *maior o potencial de atuação*! 💪\n\nAnalisamos todas no diagnóstico e identificamos em quais podemos agir. Você recebe um panorama completo antes de qualquer decisão.`,
  r1_5: () => `Funciona nos dois casos! ✅\n\n• *Antigas:* maior chance de prescrição ou irregularidades\n• *Recentes:* verificamos cobranças indevidas e juros abusivos`,

  r2_1: () => `Sinais de que somos sérios:\n\n✅ Cobramos R$ 50 primeiro (não R$ 500 de cara)\n✅ O processo completo só paga após resultado\n✅ Emitimos contrato formal\n✅ Você pode verificar antes de qualquer pagamento\n\nFraude pede valor alto na hora. Nós pedimos R$ 50 para provar viabilidade primeiro.`,
  r2_2: () => `Sim! Somos um *escritório jurídico devidamente registrado*. 📋\n\nAtuamos com base no Código de Defesa do Consumidor e na legislação de proteção de dados.`,
  r2_3: () => `Sim, atendemos *centenas de clientes* com sucesso. 🎉\n\nMuitos chegaram frustrados após renegociações e conseguiram resultado com nosso método jurídico.`,
  r2_4: () => `O R$ 50 cobre o custo real da análise. Não faz sentido cobrar R$ 250 sem verificar se há viabilidade no seu caso primeiro. 💡\n\nSe não houver caminho jurídico, você saberá por apenas R$ 50.`,
  r2_5: () => `*Seus dados ficam totalmente seguros.* 🔐\n\nUsamos apenas para análise jurídica e contrato. Seguimos a *LGPD*. Nunca compartilhamos com terceiros.`,

  r3_1: () => `*Valores completos:* 💰\n\n▶ Diagnóstico: *R$ 50* _(abatido se seguir)_\n▶ Entrada: *R$ 250*\n▶ Êxito: *R$ 450* _(só após resultado)_\n\n*Total real: R$ 650* — sendo que os R$ 450 finais só cobram quando seu nome já estiver limpo.`,
  r3_2: () => `*Prazo de até 30 dias úteis.* ⏱️\n\nA maioria resolve antes. Casos simples, menos de 15 dias.`,
  r3_3: () => `*No mesmo dia do pagamento da entrada.* ⚡\n\nAssim que confirmamos e recebemos seus documentos, o processo é aberto imediatamente.`,
  r3_4: () => `Você perde apenas os *R$ 250 de entrada* — que cobrem o trabalho realizado.\n\nOs *R$ 450 de êxito* só são cobrados se funcionar. Se não funcionar, esse valor não é cobrado. Período. 💪`,
  r3_5: () => `No momento trabalhamos com pagamento à vista via Pix.\n\nMas o desembolso é em etapas: R$ 50 agora, R$ 250 na entrada, R$ 450 só no final quando já tiver o nome limpo. 😊`,

  r4_1: () => `*Contrato formal com tudo por escrito.* 📋\n\n✅ Identificação das partes\n✅ Descrição do serviço\n✅ Prazo de até 30 dias úteis\n✅ Cláusula de êxito\n✅ Política de cancelamento`,
  r4_2: () => `*Sim, garantia por escrito no contrato.* ✅\n\nOs R$ 450 são cobrados *somente após* a remoção ser comprovada. Registrado em contrato.`,
  r4_3: () => `*Sim, você pode cancelar.* 📋\n\nO contrato tem política de cancelamento clara. Nossa equipe esclarece qualquer dúvida antes da assinatura.`,
  r4_4: () => `Muito simples! Apenas:\n\n📸 *Foto do RG* (frente e verso)\n📸 *Foto do CPF*\n\nEnviados aqui mesmo pelo WhatsApp. Nada mais.`,
  r4_5: () => `O contrato é enviado *digitalmente aqui pelo WhatsApp* após o pagamento da entrada.\n\nVocê assina de forma digital e recebe uma cópia.`,

  r5_1: () => `Você fica sabendo *aqui mesmo pelo WhatsApp*. 📲\n\nEnviamos atualizações e avisamos quando os apontamentos forem removidos. Você também pode consultar o Serasa a qualquer momento.`,
  r5_2: () => `*Sim, atuamos em todos os órgãos.* ✅\n\nSerasa, SPC, Boa Vista (SCPC), Quod e demais cadastros negativos.`,
  r5_3: () => `O bônus de score é *incluído no processo*. 📈\n\nApós a remoção, orientamos as melhores práticas para aumentar seu score rapidamente. Alguns clientes saem com score acima de 700 pontos.`,
  r5_4: () => `A dívida pode continuar existindo, mas *sem te impedir de ter crédito*. 💡\n\nO que removemos são os *apontamentos* — os registros negativos. Com isso removido, o mercado te enxerga como cliente apto. ✅`,
  r5_5: () => `*Sim!* Assim que os apontamentos forem removidos, você já pode solicitar crédito normalmente. 🎉\n\nCartões, financiamentos, crédito no comércio — tudo fica disponível.`,

  r6_1: () => `O diagnóstico é uma *análise completa do seu CPF*. 🔍\n\nVerificamos:\n• Todos os apontamentos ativos\n• Origem e data de cada dívida\n• Irregularidades jurídicas\n• Viabilidade de atuação`,
  r6_2: () => `*Não é devolvido* — mas é *abatido*. 💡\n\nSe seguir com o processo, os R$ 50 são descontados do valor final. Na prática, você não paga duas vezes.`,
  r6_3: () => `Se não houver viabilidade, você *saberá com clareza* e não gasta mais nada além dos R$ 50. 🙏\n\nPreferimos ser honestos a cobrar R$ 250 sem perspectiva real.`,
  r6_4: () => `A análise é feita logo após confirmação do pagamento. ⚡\n\nVocê recebe o resultado *nessa mesma conversa* em instantes.`,
  r6_5: () => `*Não precisa enviar nada pro diagnóstico.* 😊\n\nApenas seu *nome completo e CPF* — que você fornece aqui no chat. Documentos (RG e CPF físico) só são pedidos depois, na fase do contrato.`,

  // Outros
  humano: () => `Um momento! 👋 Vou te conectar com um dos nossos especialistas agora...`,
  nao_entendi: () => `Responde com o *número* da opção. 😊`,
};

// ─────────────────────────────────────────────────────────────
//  FLUXO PRINCIPAL
// ─────────────────────────────────────────────────────────────
async function processarMensagem(id, rawMsg) {
  const msg  = rawMsg.toLowerCase().trim();
  const num  = numeros(rawMsg);
  const c    = await lerContato(id);
  let { etapa, nome: n } = c;
  let reply  = "";

  // Modo humano — silencia o bot
  if (c.modoHumano) return "";

  // Pedido de humano a qualquer momento
  if (/humano|atendente|falar com (algu[eé]m|pessoa)|quero humano/i.test(rawMsg)) {
    c.modoHumano = true;
    await salvarContato(id, c);
    return M.humano();
  }

  // Reativação — lead voltou depois de sumir por 2h+
  const agora   = Date.now();
  const inativo = c.ultimaMsg ? (agora - c.ultimaMsg) > 2 * 60 * 60 * 1000 : false;
  c.ultimaMsg   = agora;
  if (inativo && etapa >= 5 && etapa <= 12 && !eSaudacao(rawMsg)) {
    c.reativacoes = (c.reativacoes || 0) + 1;
    if (c.reativacoes === 1) { await salvarContato(id, c); return M.reativacao_1(n); }
    if (c.reativacoes === 2) { await salvarContato(id, c); return M.reativacao_2(n); }
  }

  // Reinício — saudação ou fluxo concluído
  if (etapa === 0 || etapa >= 17 && etapa < 20 || eSaudacao(rawMsg)) {
    const novo = estadoInicial();
    novo.etapa = 1;
    await salvarContato(id, novo);
    return M.inicio();
  }

  // ── E1: captura o nome ──────────────────────────────────────
  if (etapa === 1) {
    n = capitalizar(rawMsg);
    c.nome  = n;
    c.etapa = 2;
    reply   = M.menu(n);

  // ── E2: menu principal ──────────────────────────────────────
  } else if (etapa === 2) {
    if      (num === "1") { c.etapa = 3; reply = M.onde(); }
    else if (num === "2") { c.etapa = 20; reply = M.como_funciona(); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.menu(n); }

  // ── E20: como funciona ──────────────────────────────────────
  } else if (etapa === 20) {
    if      (num === "1") { c.etapa = 3; reply = M.onde(); }
    else if (num === "2") { c.etapa = 21; reply = M.menu_retorno(n); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.como_funciona(); }

  // ── E21: menu retorno ───────────────────────────────────────
  } else if (etapa === 21) {
    if      (num === "1") { c.etapa = 3; reply = M.onde(); }
    else if (num === "2") { c.etapa = 20; reply = M.como_funciona(); }
    else if (num === "3") { c.etapa = 220; reply = M.menu_categorias(); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.menu_retorno(n); }

  // ── E22: menu dúvidas ───────────────────────────────────────
  } else if (etapa === 22) {
    c.etapa = 220; reply = M.menu_categorias();

  // ── E220: categorias ────────────────────────────────────────
  } else if (etapa === 220) {
    if      (num === "1") { c.etapa = 221; reply = M.cat1(); }
    else if (num === "2") { c.etapa = 222; reply = M.cat2(); }
    else if (num === "3") { c.etapa = 223; reply = M.cat3(); }
    else if (num === "4") { c.etapa = 224; reply = M.cat4(); }
    else if (num === "5") { c.etapa = 225; reply = M.cat5(); }
    else if (num === "6") { c.etapa = 226; reply = M.cat6(); }
    else if (num === "7") { c.etapa = 3; reply = M.onde(); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.menu_categorias(); }

  // ── E221-226: respostas das categorias ──────────────────────
  } else if (etapa === 221) {
    const rs = { "1": M.r1_1, "2": M.r1_2, "3": M.r1_3, "4": M.r1_4, "5": M.r1_5 };
    if (rs[num]) { reply = rs[num]() + "\n\n" + M.cat1(); }
    else if (num === "0") { c.etapa = 220; reply = M.menu_categorias(); }
    else { reply = M.nao_entendi() + "\n\n" + M.cat1(); }

  } else if (etapa === 222) {
    const rs = { "1": M.r2_1, "2": M.r2_2, "3": M.r2_3, "4": M.r2_4, "5": M.r2_5 };
    if (rs[num]) { reply = rs[num]() + "\n\n" + M.cat2(); }
    else if (num === "0") { c.etapa = 220; reply = M.menu_categorias(); }
    else { reply = M.nao_entendi() + "\n\n" + M.cat2(); }

  } else if (etapa === 223) {
    const rs = { "1": M.r3_1, "2": M.r3_2, "3": M.r3_3, "4": M.r3_4, "5": M.r3_5 };
    if (rs[num]) { reply = rs[num]() + "\n\n" + M.cat3(); }
    else if (num === "0") { c.etapa = 220; reply = M.menu_categorias(); }
    else { reply = M.nao_entendi() + "\n\n" + M.cat3(); }

  } else if (etapa === 224) {
    const rs = { "1": M.r4_1, "2": M.r4_2, "3": M.r4_3, "4": M.r4_4, "5": M.r4_5 };
    if (rs[num]) { reply = rs[num]() + "\n\n" + M.cat4(); }
    else if (num === "0") { c.etapa = 220; reply = M.menu_categorias(); }
    else { reply = M.nao_entendi() + "\n\n" + M.cat4(); }

  } else if (etapa === 225) {
    const rs = { "1": M.r5_1, "2": M.r5_2, "3": M.r5_3, "4": M.r5_4, "5": M.r5_5 };
    if (rs[num]) { reply = rs[num]() + "\n\n" + M.cat5(); }
    else if (num === "0") { c.etapa = 220; reply = M.menu_categorias(); }
    else { reply = M.nao_entendi() + "\n\n" + M.cat5(); }

  } else if (etapa === 226) {
    const rs = { "1": M.r6_1, "2": M.r6_2, "3": M.r6_3, "4": M.r6_4, "5": M.r6_5 };
    if (rs[num]) { reply = rs[num]() + "\n\n" + M.cat6(); }
    else if (num === "0") { c.etapa = 220; reply = M.menu_categorias(); }
    else { reply = M.nao_entendi() + "\n\n" + M.cat6(); }

  // ── E3: onde estão as restrições ────────────────────────────
  } else if (etapa === 3) {
    const loc = { "1":"Serasa", "2":"SPC", "3":"banco", "4":"cartório", "5":"local não identificado" };
    if (loc[num]) { c.dados = `Restrição: ${loc[num]}`; c.etapa = 4; reply = M.tempo(); }
    else          { reply = M.nao_entendi() + "\n\n" + M.onde(); }

  // ── E4: há quanto tempo ─────────────────────────────────────
  } else if (etapa === 4) {
    if (["1","2","3"].includes(num)) { c.etapa = 5; reply = M.tentou(); }
    else { reply = M.nao_entendi() + "\n\n" + M.tempo(); }

  // ── E5: já tentou resolver ──────────────────────────────────
  } else if (etapa === 5) {
    if      (num === "1") { c.etapa = 50; reply = M.resp_sim(n) + "\n\n" + M.ancora(); }
    else if (num === "2") { c.etapa = 50; reply = M.resp_nao(n) + "\n\n" + M.ancora(); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.tentou(); }

  // ── E50: âncora emocional ───────────────────────────────────
  } else if (etapa === 50) {
    const motivos = { "1":"Financiamento/empréstimo", "2":"Cartão de crédito", "3":"Oportunidade de trabalho", "4":"Crédito no comércio", "5":"Sair dessa situação de vez" };
    c.motivo = motivos[num] || "Limpar o nome";
    c.etapa  = 51;
    reply    = M.ancora_resp(c.motivo) + "\n\n" + M.valor_divida();

  // ── E51: valor da dívida ────────────────────────────────────
  } else if (etapa === 51) {
    const faixas = { "1":"Dívida de até R$ 1.000 —", "2":"Dívida entre R$ 1–5 mil —", "3":"Dívida entre R$ 5–20 mil —", "4":"Dívida acima de R$ 20 mil —", "5":"Valor a verificar —" };
    const f = faixas[num] || "Dívida registrada —";
    c.dados  += ` | Dívida: ${f}`;
    c.etapa  = 6;
    reply    = M.valor_resp(f) + "\n\n" + M.depoimentos() + "\n\n" + M.posicionamento(n);

  // ── E6: posicionamento + oferta diagnóstico ─────────────────
  } else if (etapa === 6) {
    if      (num === "1") { c.etapa = 7; reply = M.coletar_dados(); }
    else if (num === "2") { c.etapa = 61; reply = M.obj_valor(); }
    else if (num === "3") { c.etapa = 62; reply = M.obj_confiavel(); }
    else if (num === "4") { c.etapa = 63; reply = M.obj_ja_tentou(n); }
    else if (num === "5") { c.etapa = 64; reply = M.obj_entender(); }
    else if (num === "6") { c.etapa = 65; reply = M.obj_pensar_50(); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.posicionamento(n); }

  // ── Objeções diagnóstico R$50 ───────────────────────────────
  } else if (etapa === 61) {
    if      (num === "1") { c.etapa = 7; reply = M.coletar_dados(); }
    else if (num === "2") { c.etapa = 611; reply = M.obj_sem_50(); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.obj_valor(); }

  } else if (etapa === 611) {
    if      (num === "1") { c.etapa = 7; reply = M.coletar_dados(); }
    else if (num === "2") { reply = `Sem problema! Manda um *Oi* quando estiver pronto. 😊`; c.etapa = 0; }
    else                  { reply = M.nao_entendi() + "\n\n" + M.obj_sem_50(); }

  } else if (etapa === 62) {
    if      (num === "1") { c.etapa = 7; reply = M.coletar_dados(); }
    else if (num === "2") { c.etapa = 64; reply = M.obj_entender(); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.obj_confiavel(); }

  } else if (etapa === 63) {
    if      (num === "1") { c.etapa = 7; reply = M.coletar_dados(); }
    else if (num === "2") { c.etapa = 64; reply = M.obj_entender(); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.obj_ja_tentou(n); }

  } else if (etapa === 64) {
    if      (num === "1") { c.etapa = 7; reply = M.coletar_dados(); }
    else if (num === "2") { c.etapa = 62; reply = M.obj_confiavel(); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.obj_entender(); }

  } else if (etapa === 65) {
    if      (num === "1") { c.etapa = 611; reply = M.obj_sem_50(); }
    else if (num === "2") { c.etapa = 62; reply = M.obj_confiavel(); }
    else if (num === "3") { c.etapa = 64; reply = M.obj_entender(); }
    else if (num === "4") { reply = M.urgencia() + `Sem problema! Manda *Oi* quando quiser. 😊`; c.etapa = 0; }
    else                  { reply = M.nao_entendi() + "\n\n" + M.obj_pensar_50(); }

  // ── E7: coleta nome completo + CPF ──────────────────────────
  } else if (etapa === 7) {
    const cpfMatch = rawMsg.match(/\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?\d{2}/);
    if (cpfMatch) c.cpf = cpfMatch[0];
    c.dados += ` | Dados: ${rawMsg}`;
    c.etapa  = 8;
    reply    = M.enviar_pix50(`${BASE_URL}/pix/50`);

  // ── E8: comprovante R$50 — qualquer envio avança ────────────
  } else if (etapa === 8) {
    c.etapa = 9;
    redis.lpush("notifs", JSON.stringify({ data: new Date().toLocaleString("pt-BR"), nome: c.nome || "?", tel: id, valor: "R$ 50 — Diagnóstico" })).catch(() => {});
    reply = M.analisando_1(n) + "\n\n" + M.analisando_2() + "\n\n" + M.analisando_3() + "\n\n" + M.analisando_4() + "\n\n" + M.diagnostico(n);

  // ── E9: lead responde após diagnóstico ──────────────────────
  } else if (etapa === 9) {
    if      (num === "1") { c.etapa = 12; reply = M.oferta_processo(n); }
    else if (num === "2") { c.etapa = 91; reply = M.obj_diag(n); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.diagnostico(n); }

  } else if (etapa === 91) {
    if      (num === "1") { c.etapa = 12; reply = M.oferta_processo(n); }
    else if (num === "2") { reply = `Pode me contar qual a dúvida específica? Estou aqui para explicar! 😊`; }
    else                  { reply = M.nao_entendi() + "\n\n" + M.obj_diag(n); }

  // ── E12: oferta processo completo ───────────────────────────
  } else if (etapa === 12) {
    if      (num === "1") { c.etapa = 13; reply = M.enviar_pix250(`${BASE_URL}/pix/250`); }
    else if (num === "2") { c.etapa = 121; reply = M.obj_caro(n); }
    else if (num === "3") { c.etapa = 122; reply = M.obj_falhar(); }
    else if (num === "4") { c.etapa = 123; reply = M.obj_tempo(); }
    else if (num === "5") { c.etapa = 124; reply = M.obj_contrato(); }
    else if (num === "6") { c.etapa = 125; reply = M.obj_pensar_250(n); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.oferta_processo(n); }

  // ── Objeções processo R$250 ─────────────────────────────────
  } else if (etapa === 121) {
    if      (num === "1") { c.etapa = 13; reply = M.enviar_pix250(`${BASE_URL}/pix/250`); }
    else if (num === "2") { c.etapa = 1211; reply = M.obj_sem_250(); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.obj_caro(n); }

  } else if (etapa === 1211) {
    if      (num === "1") { c.etapa = 13; reply = M.enviar_pix250(`${BASE_URL}/pix/250`); }
    else if (num === "2") { reply = `Sem problema! Manda *Oi* quando estiver pronto. 😊`; c.etapa = 0; }
    else                  { reply = M.nao_entendi() + "\n\n" + M.obj_sem_250(); }

  } else if (etapa === 122) {
    if      (num === "1") { c.etapa = 13; reply = M.enviar_pix250(`${BASE_URL}/pix/250`); }
    else if (num === "2") { c.etapa = 12; reply = M.oferta_processo(n); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.obj_falhar(); }

  } else if (etapa === 123) {
    if      (num === "1") { c.etapa = 13; reply = M.enviar_pix250(`${BASE_URL}/pix/250`); }
    else if (num === "2") { c.etapa = 12; reply = M.oferta_processo(n); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.obj_tempo(); }

  } else if (etapa === 124) {
    if      (num === "1") { c.etapa = 13; reply = M.enviar_pix250(`${BASE_URL}/pix/250`); }
    else if (num === "2") { c.etapa = 12; reply = M.oferta_processo(n); }
    else                  { reply = M.nao_entendi() + "\n\n" + M.obj_contrato(); }

  } else if (etapa === 125) {
    if      (num === "1") { c.etapa = 1211; reply = M.obj_sem_250(); }
    else if (num === "2") { c.etapa = 122; reply = M.obj_falhar(); }
    else if (num === "3") { c.modoHumano = true; reply = M.humano(); }
    else if (num === "4") { reply = M.urgencia() + `Manda um *Oi* quando quiser. 😊`; c.etapa = 0; }
    else                  { reply = M.nao_entendi() + "\n\n" + M.obj_pensar_250(n); }

  // ── E13: comprovante R$250 — qualquer envio avança ──────────
  } else if (etapa === 13) {
    c.etapa = 14;
    redis.lpush("notifs", JSON.stringify({ data: new Date().toLocaleString("pt-BR"), nome: c.nome || "?", tel: id, valor: "R$ 250 — Entrada" })).catch(() => {});
    reply = M.pedir_rg(n);

  // ── E14: foto RG — qualquer envio avança ────────────────────
  } else if (etapa === 14) {
    c.etapa = 15;
    reply   = M.pedir_cpf_doc();

  // ── E15: foto CPF — qualquer envio avança ───────────────────
  } else if (etapa === 15) {
    c.etapa = 16;
    reply   = M.docs_ok(n);

  // ── E16: processo aberto ────────────────────────────────────
  } else if (etapa === 16) {
    c.etapa       = 17;
    c.processStart = Date.now();
    reply          = M.fechamento(n);

  // ── E17+: acompanhamento ────────────────────────────────────
  } else if (etapa >= 17) {
    const dias = c.processStart ? Math.floor((Date.now() - c.processStart) / (1000 * 60 * 60 * 24)) : 0;
    if      (dias >= 25 && !c.upd25) { c.upd25 = true; reply = M.upd_d25(n); }
    else if (dias >= 15 && !c.upd15) { c.upd15 = true; reply = M.upd_d15(n); }
    else if (dias >= 7  && !c.upd7)  { c.upd7  = true; reply = M.upd_d7(n); }
    else { reply = `Processo em andamento! ✅ Qualquer dúvida é só chamar, ${n}. Estamos com você! 💪`; }

  } else {
    reply = M.nao_entendi();
  }

  c.reativacoes = 0;
  await salvarContato(id, c);
  console.log(`[${id}] E${etapa}→E${c.etapa} | "${reply.substring(0, 60)}"`);
  return reply;
}

// ─────────────────────────────────────────────────────────────
//  WEBHOOK — recebe mensagens do Whatauto
// ─────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  console.log("📩 MSG:", JSON.stringify(req.body).substring(0, 150));
  try {
    const id     = identificarContato(req.body);
    const rawMsg = (req.body.message || "").trim();

    const reply = await processarMensagem(id, rawMsg);
    res.json({ reply: reply || "" });
  } catch (err) {
    console.error("❌ Webhook:", err.message);
    res.status(200).json({ reply: "Desculpe, tive um problema técnico. Pode repetir?" });
  }
});

// ─────────────────────────────────────────────────────────────
//  PIX
// ─────────────────────────────────────────────────────────────
app.get("/pix/:valor", async (req, res) => {
  try {
    const v = parseFloat(req.params.valor);
    if (isNaN(v) || v <= 0) return res.status(400).send("Valor inválido");
    res.setHeader("Content-Type", "text/html;charset=utf-8");
    res.send(await paginaPix(v));
  } catch (e) { res.status(500).send("Erro: " + e.message); }
});

// ─────────────────────────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────────────────────────
app.get("/dashboard", async (req, res) => {
  const keys = await redis.keys("lead:*").catch(() => []);
  const vals = keys.length ? await Promise.all(keys.map(k => redis.get(k))) : [];
  const leads = keys.map((k, i) => ({ id: k.replace("lead:", ""), ...vals[i] }))
    .filter(l => l.nome)
    .sort((a, b) => (b.ultimaMsg || 0) - (a.ultimaMsg || 0));

  const eL = { 0:"Início", 1:"Nome", 2:"Menu", 3:"Restrições", 4:"Tempo", 5:"Tentou?", 50:"Âncora", 51:"Valor dívida", 6:"Posicionamento", 7:"Dados CPF", 8:"Pix R$50", 9:"Diagnóstico", 12:"Oferta processo", 13:"Pix R$250", 14:"RG", 15:"CPF", 16:"Docs", 17:"✅ Aberto" };

  const rows = leads.map(l => {
    const et = eL[l.etapa] || `E${l.etapa}`;
    const ult = l.ultimaMsg ? new Date(l.ultimaMsg).toLocaleString("pt-BR") : "—";
    return `<tr><td>${l.nome}</td><td style="font-family:monospace;font-size:11px">${l.id}</td><td>${et}</td><td style="text-align:center">${l.etapa >= 8 ? "✅" : "—"}</td><td style="text-align:center">${l.etapa >= 13 ? "✅" : "—"}</td><td style="font-size:11px">${ult}</td><td><button onclick="resetar('${l.id}')">Reset</button></td></tr>`;
  }).join("");

  res.setHeader("Content-Type", "text/html;charset=utf-8");
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dashboard — JustHelp</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#f0f2f5;padding:20px}h1{color:#1D7874;margin-bottom:14px;font-size:20px}.nav{display:flex;gap:10px;margin-bottom:16px}.nav a{color:#1D7874;font-size:13px;padding:5px 14px;border:1px solid #1D7874;border-radius:8px;text-decoration:none}.cards{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}.c{background:#fff;border-radius:10px;padding:12px 16px;min-width:120px}.cn{font-size:26px;font-weight:700;color:#1D7874}.cl{font-size:11px;color:#888;margin-top:2px}table{width:100%;background:#fff;border-radius:10px;overflow:hidden;border-collapse:collapse}th{background:#1D7874;color:#fff;padding:9px 11px;text-align:left;font-size:12px}td{padding:8px 11px;font-size:12px;border-bottom:1px solid #f0f0f0}tr:hover td{background:#f8f9fa}button{font-size:11px;padding:2px 8px;cursor:pointer;border:1px solid #ddd;border-radius:4px}</style></head>
<body><h1>🤖 JustHelp — Dashboard</h1>
<div class="nav"><a href="/notificacoes">💰 Pagamentos</a><a href="/debug">🔧 Debug</a></div>
<div class="cards">
  <div class="c"><div class="cn">${leads.length}</div><div class="cl">Total leads</div></div>
  <div class="c"><div class="cn">${leads.filter(l => l.etapa > 0 && l.etapa < 17).length}</div><div class="cl">Em andamento</div></div>
  <div class="c"><div class="cn">${leads.filter(l => l.etapa >= 8).length}</div><div class="cl">Pagaram R$50</div></div>
  <div class="c"><div class="cn">${leads.filter(l => l.etapa >= 13).length}</div><div class="cl">Pagaram R$250</div></div>
  <div class="c"><div class="cn">${leads.filter(l => l.etapa >= 17).length}</div><div class="cl">Processos abertos</div></div>
</div>
<table><thead><tr><th>Nome</th><th>Telefone</th><th>Etapa</th><th>R$50</th><th>R$250</th><th>Última msg</th><th></th></tr></thead>
<tbody>${rows || "<tr><td colspan='7' style='text-align:center;padding:24px;color:#aaa'>Nenhum lead ainda</td></tr>"}</tbody></table>
<script>async function resetar(t){if(!confirm("Resetar "+t+"?"))return;await fetch("/resetar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({telefone:t})});location.reload();}</script>
</body></html>`);
});

// ─────────────────────────────────────────────────────────────
//  NOTIFICAÇÕES
// ─────────────────────────────────────────────────────────────
app.get("/notificacoes", async (req, res) => {
  const notifs = await redis.lrange("notifs", 0, 99).catch(() => []);
  const rows = notifs.map(n => { try { const p = JSON.parse(n); return `<tr><td>${p.data}</td><td>${p.nome}</td><td style="font-family:monospace;font-size:11px">${p.tel}</td><td style="color:#1D7874;font-weight:600">${p.valor}</td></tr>`; } catch { return ""; } }).join("");
  res.setHeader("Content-Type", "text/html;charset=utf-8");
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pagamentos — JustHelp</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;padding:20px;background:#f0f2f5}h1{color:#1D7874;margin-bottom:14px}.nav{margin-bottom:14px}.nav a{color:#1D7874;font-size:13px;padding:5px 14px;border:1px solid #1D7874;border-radius:8px;text-decoration:none}table{width:100%;background:#fff;border-radius:10px;overflow:hidden;border-collapse:collapse}th{background:#1D7874;color:#fff;padding:9px 11px;text-align:left;font-size:12px}td{padding:9px 11px;font-size:13px;border-bottom:1px solid #f0f0f0}</style></head>
<body><h1>💰 Pagamentos Recebidos</h1><div class="nav"><a href="/dashboard">← Dashboard</a></div>
<table><thead><tr><th>Data/Hora</th><th>Nome</th><th>Telefone</th><th>Valor</th></tr></thead>
<tbody>${rows || "<tr><td colspan='4' style='text-align:center;padding:20px;color:#aaa'>Nenhum pagamento ainda</td></tr>"}</tbody></table>
</body></html>`);
});

// ─────────────────────────────────────────────────────────────
//  ADMIN
// ─────────────────────────────────────────────────────────────
app.post("/assumir", async (req, res) => { const c = await lerContato(req.body.telefone); c.modoHumano = true;  await salvarContato(req.body.telefone, c); res.json({ ok: true }); });
app.post("/liberar", async (req, res) => { const c = await lerContato(req.body.telefone); c.modoHumano = false; await salvarContato(req.body.telefone, c); res.json({ ok: true }); });
app.post("/resetar", async (req, res) => { await redis.del(`lead:${req.body.telefone}`); res.json({ ok: true }); });

app.get("/contatos", async (req, res) => {
  const keys = await redis.keys("lead:*").catch(() => []);
  if (!keys.length) return res.json([]);
  const vals = await Promise.all(keys.map(k => redis.get(k)));
  res.json(keys.map((k, i) => ({ id: k.replace("lead:", ""), ...vals[i] })));
});

app.get("/debug", async (req, res) => {
  const rok = await redis.ping().then(() => true).catch(() => false);
  res.json({ status: "ok", redis: rok, baseUrl: BASE_URL, node: process.version });
});

app.get("/", (_, res) => res.redirect("/dashboard"));

// ─────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ JustHelp Bot v12 | porta ${PORT}`));
