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
console.log("✅ JustHelp Bot iniciando | " + BASE_URL);

// ─────────────────────────────────────────────────────────────
//  IDENTIFICAÇÃO DO CONTATO
// ─────────────────────────────────────────────────────────────
function identificarContato(body) {
  console.log("📩 Body:", JSON.stringify(body).substring(0, 200));
  const campos = [body.phone, body.sender, body.from, body.number]
    .filter(Boolean).map(v => String(v).trim());

  // 1. Número com 8+ dígitos
  for (const c of campos) {
    const d = c.replace(/\D/g, "");
    if (d.length >= 8) return d;
  }

  // 2. Nome de contato como ID estável
  for (const c of campos) {
    if (c && c !== "WhatsAuto app" && c.length >= 3) {
      const id = c.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "").trim()
        .replace(/\s+/g, "_").substring(0, 40);
      if (id.length >= 3) {
        console.log("📱 ID por nome:", id);
        return id;
      }
    }
  }

  // 3. Hash estável
  let h = 0;
  const raw = JSON.stringify(body);
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h) + raw.charCodeAt(i);
    h |= 0;
  }
  return `anon_${Math.abs(h)}`;
}

// ─────────────────────────────────────────────────────────────
//  ESTADO
// ─────────────────────────────────────────────────────────────
function novoEstado() {
  return {
    etapa: 0, nome: "", cpf: "", local: "", dados: "", motivo: "",
    modoHumano: false, ultimaMsg: 0, tentativas: 0,
    processStart: null, upd7: false, upd15: false, upd25: false,
  };
}
async function lerContato(id) {
  try {
    const d = await redis.get("l:" + id);
    if (!d) return novoEstado();
    return Object.assign(novoEstado(), d);
  } catch(e) {
    console.error("Redis get:", e.message);
    return novoEstado();
  }
}
async function salvarContato(id, c) {
  try { await redis.set("l:" + id, c); }
  catch(e) { console.error("Redis set:", e.message); }
}
function cap(t) {
  return (t || "").trim().split(" ")
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}
function isOi(m) {
  return /^(oi|ol[aá]|oii+|bom dia|boa tarde|boa noite|hello|hi|opa|salve|al[oô]|menu|inicio|start|começar)[\s!?.]*$/i.test(m.trim());
}
function num(msg) {
  return msg.replace(/[^0-9]/g, "");
}

// ─────────────────────────────────────────────────────────────
//  PIX
// ─────────────────────────────────────────────────────────────
function pf(id, v) { return id + String(v.length).padStart(2, "0") + v; }
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
  const ad = pf("05", "JUSTHELPADV");
  const p  = pf("00", "01") + pf("01", "12") + pf("26", ma) +
             pf("52", "0000") + pf("53", "986") +
             pf("54", Number(valor).toFixed(2)) +
             pf("58", "BR") + pf("59", "JustHelp Adv") +
             pf("60", "Sao Paulo") + pf("62", ad) + "6304";
  return p + pcrc(p);
}
async function paginaPix(valor) {
  const code  = pixPayload(valor);
  const qrImg = await QRCode.toDataURL(code, { width: 260, margin: 2 });
  const label = valor == 50 ? "Diagnóstico de CPF" : "Entrada — Restauração de Crédito";
  const vStr  = Number(valor).toFixed(2).replace(".", ",");
  return "<!DOCTYPE html>" +
    "<html lang='pt-BR'><head><meta charset='UTF-8'>" +
    "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<title>Pagar R$ " + vStr + " — JustHelp</title>" +
    "<style>*{box-sizing:border-box;margin:0;padding:0}" +
    "body{font-family:-apple-system,sans-serif;background:#f0f2f5;min-height:100vh;" +
    "display:flex;align-items:center;justify-content:center;padding:16px}" +
    ".card{background:#fff;border-radius:20px;padding:28px 22px;max-width:360px;width:100%;text-align:center}" +
    ".logo{background:#1D7874;color:#fff;border-radius:10px;padding:8px 18px;" +
    "display:inline-block;font-weight:700;font-size:17px;margin-bottom:14px}" +
    ".valor{font-size:36px;font-weight:700;color:#1D7874}" +
    ".sub{color:#888;font-size:13px;margin-bottom:18px}" +
    ".qr{background:#f8f9fa;border-radius:14px;padding:14px;display:inline-block;margin-bottom:16px}" +
    ".qr img{display:block;width:230px;height:230px}" +
    ".steps{text-align:left;margin-bottom:14px}" +
    ".step{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#444}" +
    ".step:last-child{border:none}" +
    ".n{background:#1D7874;color:#fff;border-radius:50%;width:20px;height:20px;" +
    "display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px}" +
    ".copia{background:#f8f9fa;border-radius:10px;padding:10px;font-family:monospace;" +
    "font-size:10px;color:#333;word-break:break-all;margin-bottom:10px;text-align:left;line-height:1.5}" +
    ".btn{width:100%;padding:14px;border-radius:10px;border:none;font-size:15px;" +
    "font-weight:700;cursor:pointer;background:#1D7874;color:#fff}" +
    ".ok{background:#22c55e}.aviso{font-size:11px;color:#aaa;margin-top:12px}</style></head>" +
    "<body><div class='card'>" +
    "<div class='logo'>JustHelp</div>" +
    "<div class='valor'>R$ " + vStr + "</div>" +
    "<div class='sub'>" + label + "</div>" +
    "<div class='qr'><img src='" + qrImg + "' alt='QR Pix'></div>" +
    "<div class='steps'>" +
    "<div class='step'><span class='n'>1</span><span>Abra seu banco ou app</span></div>" +
    "<div class='step'><span class='n'>2</span><span>Pix → QR Code ou Copia e Cola</span></div>" +
    "<div class='step'><span class='n'>3</span><span>Confirme e pague</span></div>" +
    "</div>" +
    "<div class='copia' id='cod'>" + code + "</div>" +
    "<button class='btn' id='btn' onclick='copy()'>📋 Copiar código Pix</button>" +
    "<div class='aviso'>⚠️ Após pagar, volte ao WhatsApp e envie o comprovante.</div>" +
    "</div>" +
    "<script>function copy(){navigator.clipboard.writeText(document.getElementById('cod').textContent)" +
    ".then(()=>{const b=document.getElementById('btn');b.textContent='✅ Copiado!';" +
    "b.classList.add('ok');setTimeout(()=>{b.textContent='📋 Copiar código Pix';" +
    "b.classList.remove('ok')},3000)})}</script></body></html>";
}

// ─────────────────────────────────────────────────────────────
//  TODAS AS MENSAGENS
// ─────────────────────────────────────────────────────────────
const M = {};

// Fase 1 — Abertura e qualificação
M.inicio        = function()  { return "Olá! 👋 Bem-vindo à *JustHelp Assessoria Jurídica*.\n\nMe fala seu *nome* para eu te atender melhor. 😊"; };
M.menu          = function(n) { return "Prazer, *" + n + "*! 😊\n\nComo posso te ajudar?\n\n1️⃣ Quero limpar meu nome\n2️⃣ Entender como funciona"; };
M.como_funciona = function()  { return "Boa pergunta! 💡\n\nNosso trabalho é diferente de renegociação. Fazemos *análise jurídica* das dívidas — identificamos irregularidades como juros abusivos, prescrição vencida e cobranças indevidas.\n\nCom isso, pedimos juridicamente a *remoção dos apontamentos* do Serasa, SPC e outros. Você volta a ter crédito! ⚖️\n📈 Bônus: aumento de score incluso.\n\n1️⃣ Quero fazer o diagnóstico\n2️⃣ Voltar ao menu"; };
M.onde          = function()  { return "Onde estão suas restrições?\n\n1️⃣ Serasa\n2️⃣ SPC\n3️⃣ Banco específico\n4️⃣ Cartório\n5️⃣ Não sei ao certo"; };
M.tempo         = function()  { return "Há quanto tempo está negativado?\n\n1️⃣ Menos de 1 ano\n2️⃣ Entre 1 e 3 anos\n3️⃣ Mais de 3 anos"; };
M.tentou        = function()  { return "Já tentou resolver antes?\n\n1️⃣ Sim, tentei renegociar ou parcelar\n2️⃣ Não, é minha primeira vez"; };
M.resp_sim      = function(n) { return n + ", renegociação *não resolve* — a dívida continua lá. Nosso trabalho é jurídico: encontramos os erros e pedimos a *remoção dos apontamentos*. É diferente! 💪"; };
M.resp_nao      = function(n) { return "Boa notícia, " + n + " — você está no lugar certo! 😊"; };
M.ancora        = function()  { return "Por que limpar o nome é importante pra você agora? 🎯\n\n1️⃣ Financiamento ou empréstimo\n2️⃣ Cartão de crédito\n3️⃣ Oportunidade de trabalho\n4️⃣ Crédito no comércio\n5️⃣ Me livrar dessa situação de vez"; };
M.ancora_resp   = function(m) { return "*" + m + "* — ótimo motivo! 💪 Quanto antes agir, mais rápido isso vira realidade."; };
M.valor_divida  = function()  { return "Qual é o valor aproximado das suas dívidas?\n\n1️⃣ Até R$ 1.000\n2️⃣ Entre R$ 1.000 e R$ 5.000\n3️⃣ Entre R$ 5.000 e R$ 20.000\n4️⃣ Acima de R$ 20.000\n5️⃣ Não sei ao certo"; };
M.valor_resp    = function(f) { return f + " Anotado! Isso nos ajuda a focar nos pontos certos. 🔍"; };
M.depoimentos   = function()  { return "Veja o que dizem nossos clientes: 💬\n\n⭐ *\"Em 22 dias o processo foi concluído e consegui meu cartão.\"* — Carlos, SP\n\n⭐ *\"Nome limpo em 18 dias. Já fiz meu financiamento.\"* — Fernanda, RJ\n\n⭐ *\"Tentei renegociar por anos. Com a JustHelp saiu em 1 mês.\"* — Roberto, MG"; };

// Fase 2 — Posicionamento e oferta diagnóstico R$50
M.posicionamento = function(n) { return n + ", o primeiro passo é um *diagnóstico completo do seu CPF* por *R$ 50*. 🔍\n\nSe seguir com o processo, esse valor já vem *abatido*.\n\nO que acha?\n\n1️⃣ Quero fazer o diagnóstico agora\n2️⃣ Tenho dúvidas sobre o valor\n3️⃣ Não sei se é confiável\n4️⃣ Já tentei antes e não funcionou\n5️⃣ Quero entender melhor como funciona\n6️⃣ Preciso pensar um pouco"; };
M.obj_valor      = function()  { return "R$ 50 é menos que uma consulta médica. Se não houver viabilidade, você sabe *antes* de gastar mais. E se seguir, já vem *abatido*.\n\n1️⃣ Faz sentido, quero o diagnóstico\n2️⃣ Mesmo assim não tenho o valor agora"; };
M.obj_sem_50     = function()  { return "Tudo bem! Quando puder, é só mandar um *Oi* aqui. 😊\n\n1️⃣ Na verdade consigo sim — quero agora\n2️⃣ Vou guardar e volto depois"; };
M.obj_confiavel  = function()  { return "Sua desconfiança é válida — tem muita fraude por aí! 🙏\n\nSomos escritório jurídico registrado. O R$ 50 existe para você ver a viabilidade *antes* de investir mais. Se não funcionar, não gasta mais nada.\n\n1️⃣ Faz sentido, vou fazer o diagnóstico\n2️⃣ Quero saber mais antes"; };
M.obj_ja_tentou  = function(n) { return n + ", o que tentou foi *renegociação ou parcelamento*? Esse modelo não remove — a dívida fica lá.\n\nNosso trabalho é jurídico: encontramos os erros e pedimos a *remoção dos apontamentos*. É completamente diferente! 💪\n\n1️⃣ Entendi, quero tentar esse caminho\n2️⃣ Ainda tenho dúvidas"; };
M.obj_entender   = function()  { return "Em 3 passos simples: 📋\n\n*1.* Diagnóstico do CPF — R$ 50\n*2.* Se viável, processo jurídico — entrada R$ 250\n*3.* Remoção dos apontamentos — R$ 450 *somente* após resultado\n📈 Bônus de score incluso!\n\n1️⃣ Entendi! Quero começar\n2️⃣ Ainda tenho dúvida"; };
M.obj_pensar_50  = function()  { return "Claro, sem pressão! 😊 O que está te travando?\n\n1️⃣ Questão financeira no momento\n2️⃣ Não confio totalmente ainda\n3️⃣ Quero entender melhor\n4️⃣ Vou pensar e retorno depois"; };
M.urgencia       = function()  { return "⚠️ Nossa equipe tem vagas limitadas por dia. No momento tenho *1 vaga disponível*. Se não confirmar hoje, não garanto para amanhã.\n\n"; };
M.coletar_dados  = function()  { return "Ótimo! 🎉 Me envia seu *nome completo* e *CPF*. 📋"; };

// Fase 3 — Pagamento R$50 e diagnóstico
M.pix50         = function(u)  { return "Perfeito! 🖥️\n\n💳 *Valor:* R$ 50\n\n👇 *Clique aqui para pagar (QR Code + Copia e Cola):*\n" + u + "\n\nAssim que pagar, me envia o comprovante aqui. 📸"; };
M.analisando_1  = function(n)  { return "✅ Pagamento confirmado! Obrigado, " + n + "!\n\nJá iniciei sua análise. Aguarda um momento... 🔍"; };
M.analisando_2  = function()   { return "🔎 *Verificando Serasa...*\n_consultando base de dados..._"; };
M.analisando_3  = function()   { return "🔎 *Verificando SPC e bancos associados...*\n_analisando histórico..._"; };
M.analisando_4  = function()   { return "🔎 *Verificando irregularidades jurídicas...*\n_identificando possibilidades..._"; };
M.diagnostico   = function(n)  { return "📊 *DIAGNÓSTICO CONCLUÍDO — " + n.toUpperCase() + "*\n\n✅ Restrições identificadas\n✅ Irregularidades detectadas\n✅ Viabilidade jurídica: *FAVORÁVEL*\n\n" + n + ", o cenário para restauração do seu crédito é *positivo*!\n\n1️⃣ Quero saber o próximo passo\n2️⃣ Tenho dúvidas sobre o resultado"; };
M.obj_diag      = function(n)  { return n + ", identificamos pontos com possibilidade de atuação jurídica. Não garantimos 100% em tudo, mas o cenário é *favorável* para boa parte das suas restrições. 😊\n\n1️⃣ Entendi, quero avançar\n2️⃣ Ainda tenho dúvidas"; };

// Fase 4 — Oferta processo completo
M.oferta_processo = function(n) { return n + ", para darmos entrada e buscarmos a *liberação do seu nome*: ⚖️\n\n▶ *Entrada:* R$ 250\n▶ *Êxito:* R$ 450 _(pago SOMENTE após resultado)_\n▶ *Bônus:* R$ 50 do diagnóstico já abatidos!\n▶ *Prazo:* até *30 dias úteis*\n▶ *Bônus:* aumento de score incluído! 📈\n▶ *Contrato:* formal e digital\n\n⚠️ Se não funcionar, você *não paga* os R$ 450.\n\n1️⃣ Quero entrar no processo agora\n2️⃣ O valor está alto para mim\n3️⃣ E se não funcionar?\n4️⃣ Quanto tempo demora?\n5️⃣ Como funciona o contrato?\n6️⃣ Preciso pensar um pouco"; };
M.obj_caro       = function(n) { return n + ", com o nome limpo você volta a ter cartão, financiamentos e crédito. Isso vale *muito mais* que R$ 250. E os R$ 450 de êxito só pagam *depois que o nome já estiver limpo*.\n\n1️⃣ Faz sentido, quero entrar\n2️⃣ Realmente não tenho o valor agora"; };
M.obj_sem_250    = function()  { return "Tudo bem! Quando estiver pronto, manda *Oi* que retomamos. Seu diagnóstico fica salvo aqui. 😊\n\n1️⃣ Na verdade consigo sim — quero entrar\n2️⃣ Vou organizar e volto"; };
M.obj_falhar     = function()  { return "Os R$ 450 são cobrados *SOMENTE após o resultado*. Se não funcionar, você *não paga esse valor*.\n\n• Você arrisca: R$ 250 de entrada\n• Nós arriscamos: todo o trabalho jurídico\n• Só cobramos quando você ganhar 💪\n\n1️⃣ Entendi, quero entrar\n2️⃣ Ainda tenho dúvida"; };
M.obj_tempo      = function()  { return "*Prazo de até 30 dias úteis.* ⏱️\n\nA maioria resolve antes. Casos simples, menos de 15 dias. Assim que você entrar, o processo começa *no mesmo dia*. ⚡\n\n1️⃣ Ótimo, quero começar agora\n2️⃣ Preciso pensar mais"; };
M.obj_contrato   = function()  { return "Trabalhamos com *total transparência*. 📄\n\nContrato digital com:\n✅ Prazo garantido (30 dias úteis)\n✅ Cláusula de êxito (só paga se funcionar)\n✅ Todas as obrigações das partes\n\n1️⃣ Entendi, quero assinar\n2️⃣ Tenho mais dúvidas"; };
M.obj_pensar_250 = function(n) { return n + ", sem pressão! O que está te travando?\n\n1️⃣ Questão financeira\n2️⃣ Ainda tenho dúvida sobre o processo\n3️⃣ Quero consultar alguém antes\n4️⃣ Vou pensar e retorno depois"; };

// Fase 5 — Pagamento R$250 e documentos
M.pix250        = function(u)  { return "Ótima decisão! 🎉\n\n💳 *Entrada: R$ 250*\n\n👇 *Clique aqui para pagar (QR Code + Copia e Cola):*\n" + u + "\n\nAssim que pagar, me envia o comprovante aqui. 📸"; };
M.pedir_rg      = function(n)  { return "*Entrada confirmada!* ✅ Obrigado, " + n + "!\n\nPara formalizar seu contrato, preciso de:\n\n📄 *Foto do RG* (frente e verso)\n\n📸 _Envie a foto aqui agora._"; };
M.pedir_cpf_doc = function()   { return "Perfeito! ✅\n\nAgora me envia uma foto do seu *CPF*. 📸"; };
M.docs_ok       = function(n)  { return "Documentação recebida! ✅\n\n" + n + ", estamos preparando seu contrato com base nas informações coletadas."; };

// Fase 6 — Fechamento e acompanhamento
M.fechamento    = function(n)  { return "🎉 *" + n + ", seu processo foi OFICIALMENTE ABERTO!*\n\nResumo:\n\n⚖️ Nossa equipe já está trabalhando na *remoção dos seus apontamentos*\n📅 Prazo de até *30 dias úteis*\n📈 *Bônus:* aumento de score incluso\n📄 Contrato será enviado em breve\n💰 Os R$ 450 só são cobrados *após* o resultado\n\nVocê tomou a decisão certa! 💪\n\nQualquer dúvida, é só mandar mensagem aqui. Estamos com você! 😊"; };
M.upd_d7        = function(n)  { return "Olá, *" + n + "*! 👋\n\nSeu processo está em andamento há 7 dias. Nossa equipe jurídica está trabalhando nas análises. ⚖️\n\nQualquer dúvida é só chamar! 😊"; };
M.upd_d15       = function(n)  { return "*" + n + "*, atualização do processo! 📋\n\n15 dias em andamento. Estamos na fase jurídica. Em breve teremos novidades! 💪"; };
M.upd_d25       = function(n)  { return "*" + n + "*, reta final! 🏁\n\n25 dias em andamento. Nossa equipe está concluindo os procedimentos. Em breve o resultado chegará. 😊"; };

// Menu retorno
M.menu_retorno  = function(n)  { return "Certo, *" + n + "*! 😊 Por onde quer continuar?\n\n1️⃣ Quero fazer o diagnóstico do meu CPF\n2️⃣ Entender melhor como funciona\n3️⃣ Tenho dúvidas antes de decidir"; };

// Menu de dúvidas — categorias
M.menu_cat = function() { return "Pode tirar todas as dúvidas! 😊 Escolha a categoria:\n\n1️⃣ Sobre o serviço\n2️⃣ Confiança e segurança\n3️⃣ Valores e prazo\n4️⃣ Contrato e garantias\n5️⃣ Sobre o resultado\n6️⃣ Sobre o diagnóstico de R$ 50\n\n7️⃣ Já tirei minhas dúvidas — quero começar!"; };
M.cat1     = function() { return "*Sobre o serviço:* ⚖️\n\n1️⃣ O que exatamente vocês fazem?\n2️⃣ Preciso pagar a dívida?\n3️⃣ Funciona pra qualquer tipo de dívida?\n4️⃣ E se eu tiver muitas dívidas?\n5️⃣ Funciona pra dívida antiga ou recente?\n\n0️⃣ Voltar às categorias"; };
M.cat2     = function() { return "*Confiança e segurança:* 🔒\n\n1️⃣ Como sei que não é golpe?\n2️⃣ Vocês são escritório registrado?\n3️⃣ Já atenderam outros clientes?\n4️⃣ Por que cobram só R$ 50 no início?\n5️⃣ Meus dados ficam seguros?\n\n0️⃣ Voltar às categorias"; };
M.cat3     = function() { return "*Valores e prazo:* 💰\n\n1️⃣ Quanto custa no total?\n2️⃣ Quanto tempo demora?\n3️⃣ Quando começa após o pagamento?\n4️⃣ Se não funcionar, perco tudo?\n5️⃣ Posso parcelar?\n\n0️⃣ Voltar às categorias"; };
M.cat4     = function() { return "*Contrato e garantias:* 📄\n\n1️⃣ Como funciona o contrato?\n2️⃣ Tenho garantia por escrito?\n3️⃣ Posso cancelar depois?\n4️⃣ O que preciso enviar?\n5️⃣ Como recebo o contrato?\n\n0️⃣ Voltar às categorias"; };
M.cat5     = function() { return "*Sobre o resultado:* 🏆\n\n1️⃣ Como fico sabendo do resultado?\n2️⃣ Remove de todos os órgãos?\n3️⃣ Como funciona o bônus de score?\n4️⃣ O que acontece com a dívida depois?\n5️⃣ Posso pedir crédito logo após?\n\n0️⃣ Voltar às categorias"; };
M.cat6     = function() { return "*Sobre o diagnóstico de R$ 50:* 🔍\n\n1️⃣ O que é o diagnóstico exatamente?\n2️⃣ O R$ 50 é devolvido?\n3️⃣ E se não houver viabilidade?\n4️⃣ O diagnóstico é imediato?\n5️⃣ Preciso enviar documentos?\n\n0️⃣ Voltar às categorias"; };

// Respostas cat 1
M.r1_1 = function() { return "Analisamos juridicamente as dívidas, identificamos irregularidades e pedimos a *remoção dos apontamentos* do Serasa/SPC e outros. Resultado: nome limpo e crédito disponível. 🎯"; };
M.r1_2 = function() { return "*Não precisa pagar a dívida.* 🙅 Removemos os *apontamentos* — a dívida pode continuar existindo juridicamente, mas sem te impedir de ter crédito. ✅"; };
M.r1_3 = function() { return "Trabalhamos com a maioria: cartão, banco, financeira, loja, operadora. O diagnóstico identifica quais têm viabilidade no seu caso. 🔍"; };
M.r1_4 = function() { return "Quanto mais restrições, *maior o potencial de atuação*! 💪 Analisamos todas e você recebe um panorama completo antes de qualquer decisão."; };
M.r1_5 = function() { return "Funciona nos dois casos! ✅\n• *Antigas:* maior chance de prescrição ou irregularidades\n• *Recentes:* verificamos cobranças indevidas e juros abusivos"; };

// Respostas cat 2
M.r2_1 = function() { return "Sinais de que somos sérios:\n✅ Cobramos R$ 50 primeiro (não R$ 500 de cara)\n✅ Processo completo só paga após resultado\n✅ Emitimos contrato formal\nFraude pede valor alto na hora. Nós pedimos R$ 50 para provar viabilidade primeiro."; };
M.r2_2 = function() { return "Sim! Escritório jurídico registrado. Atuamos pelo Código de Defesa do Consumidor e legislação de proteção de dados. 📋"; };
M.r2_3 = function() { return "Sim, centenas de clientes atendidos. 🎉 Muitos vieram frustrados de renegociações e conseguiram resultado com nosso método jurídico."; };
M.r2_4 = function() { return "O R$ 50 cobre o custo real da análise. Não faz sentido cobrar R$ 250 sem verificar se há viabilidade no seu caso primeiro. 💡"; };
M.r2_5 = function() { return "Seus dados ficam 100% seguros. 🔐 Usamos apenas para análise jurídica e contrato. Seguimos a LGPD. Nunca compartilhamos com terceiros."; };

// Respostas cat 3
M.r3_1 = function() { return "Valores completos: 💰\n▶ Diagnóstico: *R$ 50* (abatido se seguir)\n▶ Entrada: *R$ 250*\n▶ Êxito: *R$ 450* (só após resultado)\n\n*Total real: R$ 650* — os R$ 450 só cobram quando o nome já estiver limpo."; };
M.r3_2 = function() { return "*Prazo de até 30 dias úteis.* ⏱️ A maioria resolve antes. Casos simples, menos de 15 dias."; };
M.r3_3 = function() { return "*No mesmo dia do pagamento da entrada.* ⚡ Assim que confirmamos e recebemos seus documentos, o processo é aberto imediatamente."; };
M.r3_4 = function() { return "Você perde apenas os *R$ 250 de entrada*. Os *R$ 450 de êxito* só são cobrados se funcionar. Se não funcionar, não paga. Período. 💪"; };
M.r3_5 = function() { return "Trabalhamos com pagamento à vista via Pix. Mas o desembolso é em etapas: R$ 50 agora, R$ 250 na entrada, R$ 450 só no final quando já tiver o nome limpo. 😊"; };

// Respostas cat 4
M.r4_1 = function() { return "Contrato formal com tudo por escrito: 📋\n✅ Identificação das partes\n✅ Prazo de até 30 dias úteis\n✅ Cláusula de êxito (só paga se funcionar)\n✅ Política de cancelamento"; };
M.r4_2 = function() { return "Sim, garantia por escrito no contrato. ✅ Os R$ 450 são cobrados *somente após* a remoção ser comprovada."; };
M.r4_3 = function() { return "Sim, você pode cancelar. 📋 O contrato tem política de cancelamento clara. Nossa equipe esclarece qualquer dúvida antes da assinatura."; };
M.r4_4 = function() { return "Apenas foto do *RG* (frente e verso) e foto do *CPF*. Enviados aqui mesmo pelo WhatsApp. Nada mais."; };
M.r4_5 = function() { return "O contrato é enviado digitalmente aqui pelo WhatsApp após o pagamento da entrada. Você assina e recebe uma cópia."; };

// Respostas cat 5
M.r5_1 = function() { return "Você fica sabendo aqui pelo WhatsApp. 📲 Enviamos atualizações e avisamos quando os apontamentos forem removidos. Você também pode consultar o Serasa quando quiser."; };
M.r5_2 = function() { return "Sim! Atuamos em todos os órgãos. ✅ Serasa, SPC, Boa Vista (SCPC), Quod e demais cadastros negativos."; };
M.r5_3 = function() { return "O bônus de score é incluído no processo. 📈 Após a remoção, orientamos as melhores práticas. Alguns clientes chegam a mais de 700 pontos."; };
M.r5_4 = function() { return "A dívida pode continuar existindo, mas *sem te impedir de ter crédito*. 💡 Com os apontamentos removidos, o mercado te enxerga como cliente apto. ✅"; };
M.r5_5 = function() { return "Sim! 🎉 Assim que os apontamentos forem removidos, você já pode solicitar crédito normalmente. Cartões, financiamentos, crédito no comércio — tudo disponível."; };

// Respostas cat 6
M.r6_1 = function() { return "O diagnóstico é uma análise completa do seu CPF. 🔍 Verificamos todos os apontamentos ativos, origem e data de cada dívida, irregularidades jurídicas e viabilidade de atuação."; };
M.r6_2 = function() { return "Não é devolvido — mas é *abatido*. 💡 Se seguir com o processo, os R$ 50 são descontados do valor final. Na prática, você não paga duas vezes."; };
M.r6_3 = function() { return "Se não houver viabilidade, você saberá com clareza e não gasta mais nada além dos R$ 50. 🙏 Preferimos ser honestos a cobrar R$ 250 sem perspectiva real."; };
M.r6_4 = function() { return "A análise é feita logo após confirmação do pagamento. ⚡ Você recebe o resultado nessa mesma conversa em instantes."; };
M.r6_5 = function() { return "Não precisa enviar nada para o diagnóstico. 😊 Apenas nome completo e CPF — fornecidos aqui no chat."; };

// Reativação e outros
M.reativacao  = function(n)  { return "Oi, *" + n + "*! 😊 Vi que você ficou com dúvidas na última vez.\n\nAinda tenho *vaga disponível hoje*. Posso retomar de onde paramos?\n\n1️⃣ Sim, quero continuar\n2️⃣ Ainda preciso pensar"; };
M.humano      = function()   { return "👋 Conectando com um especialista agora..."; };
M.nao_entendi = function()   { return "Responde com o *número* da opção. 😊"; };

// ─────────────────────────────────────────────────────────────
//  FLUXO PRINCIPAL
// ─────────────────────────────────────────────────────────────
async function processar(id, rawMsg) {
  const msg   = rawMsg.toLowerCase().trim();
  const n     = num(rawMsg);
  const c     = await lerContato(id);
  const agora = Date.now();
  let reply   = "";
  let etapa   = c.etapa;
  let nome    = c.nome;

  // Modo humano — bot silencioso
  if (c.modoHumano) return "";

  // Pedido de humano a qualquer momento
  if (/humano|atendente|falar com (algu[eé]m|pessoa)|quero humano/i.test(rawMsg)) {
    c.modoHumano = true;
    await salvarContato(id, c);
    return M.humano();
  }

  // Reativação após 2h de silêncio nas etapas de venda
  const inativo = c.ultimaMsg && (agora - c.ultimaMsg) > 2 * 60 * 60 * 1000;
  c.ultimaMsg   = agora;
  if (inativo && etapa >= 4 && etapa <= 8 && !isOi(rawMsg)) {
    c.tentativas = (c.tentativas || 0) + 1;
    if (c.tentativas <= 2) {
      await salvarContato(id, c);
      return M.reativacao(nome);
    }
  }

  // Reinício — saudação ou etapa 0
  if (etapa === 0 || isOi(rawMsg)) {
    const novo     = novoEstado();
    novo.etapa     = 1;
    novo.ultimaMsg = agora;
    await salvarContato(id, novo);
    return M.inicio();
  }

  // ── E1: captura o nome ──────────────────────────────────────
  if (etapa === 1) {
    nome      = cap(rawMsg);
    c.nome    = nome;
    c.etapa   = 2;
    reply     = M.menu(nome);

  // ── E2: menu principal ──────────────────────────────────────
  } else if (etapa === 2) {
    if      (n === "1") { c.etapa = 3; reply = M.onde(); }
    else if (n === "2") { c.etapa = 20; reply = M.como_funciona(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.menu(nome); }

  // ── E20: como funciona ──────────────────────────────────────
  } else if (etapa === 20) {
    if      (n === "1") { c.etapa = 3; reply = M.onde(); }
    else if (n === "2") { c.etapa = 21; reply = M.menu_retorno(nome); }
    else                { reply = M.nao_entendi() + "\n\n" + M.como_funciona(); }

  // ── E21: menu retorno ───────────────────────────────────────
  } else if (etapa === 21) {
    if      (n === "1") { c.etapa = 3; reply = M.onde(); }
    else if (n === "2") { c.etapa = 20; reply = M.como_funciona(); }
    else if (n === "3") { c.etapa = 220; reply = M.menu_cat(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.menu_retorno(nome); }

  // ── E220: categorias de dúvidas ─────────────────────────────
  } else if (etapa === 220) {
    if      (n === "1") { c.etapa = 221; reply = M.cat1(); }
    else if (n === "2") { c.etapa = 222; reply = M.cat2(); }
    else if (n === "3") { c.etapa = 223; reply = M.cat3(); }
    else if (n === "4") { c.etapa = 224; reply = M.cat4(); }
    else if (n === "5") { c.etapa = 225; reply = M.cat5(); }
    else if (n === "6") { c.etapa = 226; reply = M.cat6(); }
    else if (n === "7") { c.etapa = 3; reply = M.onde(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.menu_cat(); }

  // ── E221: dúvidas sobre o serviço ───────────────────────────
  } else if (etapa === 221) {
    if      (n === "1") { reply = M.r1_1() + "\n\n" + M.cat1(); }
    else if (n === "2") { reply = M.r1_2() + "\n\n" + M.cat1(); }
    else if (n === "3") { reply = M.r1_3() + "\n\n" + M.cat1(); }
    else if (n === "4") { reply = M.r1_4() + "\n\n" + M.cat1(); }
    else if (n === "5") { reply = M.r1_5() + "\n\n" + M.cat1(); }
    else if (n === "0") { c.etapa = 220; reply = M.menu_cat(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.cat1(); }

  // ── E222: dúvidas sobre confiança ───────────────────────────
  } else if (etapa === 222) {
    if      (n === "1") { reply = M.r2_1() + "\n\n" + M.cat2(); }
    else if (n === "2") { reply = M.r2_2() + "\n\n" + M.cat2(); }
    else if (n === "3") { reply = M.r2_3() + "\n\n" + M.cat2(); }
    else if (n === "4") { reply = M.r2_4() + "\n\n" + M.cat2(); }
    else if (n === "5") { reply = M.r2_5() + "\n\n" + M.cat2(); }
    else if (n === "0") { c.etapa = 220; reply = M.menu_cat(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.cat2(); }

  // ── E223: dúvidas sobre valores ─────────────────────────────
  } else if (etapa === 223) {
    if      (n === "1") { reply = M.r3_1() + "\n\n" + M.cat3(); }
    else if (n === "2") { reply = M.r3_2() + "\n\n" + M.cat3(); }
    else if (n === "3") { reply = M.r3_3() + "\n\n" + M.cat3(); }
    else if (n === "4") { reply = M.r3_4() + "\n\n" + M.cat3(); }
    else if (n === "5") { reply = M.r3_5() + "\n\n" + M.cat3(); }
    else if (n === "0") { c.etapa = 220; reply = M.menu_cat(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.cat3(); }

  // ── E224: dúvidas sobre contrato ────────────────────────────
  } else if (etapa === 224) {
    if      (n === "1") { reply = M.r4_1() + "\n\n" + M.cat4(); }
    else if (n === "2") { reply = M.r4_2() + "\n\n" + M.cat4(); }
    else if (n === "3") { reply = M.r4_3() + "\n\n" + M.cat4(); }
    else if (n === "4") { reply = M.r4_4() + "\n\n" + M.cat4(); }
    else if (n === "5") { reply = M.r4_5() + "\n\n" + M.cat4(); }
    else if (n === "0") { c.etapa = 220; reply = M.menu_cat(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.cat4(); }

  // ── E225: dúvidas sobre resultado ───────────────────────────
  } else if (etapa === 225) {
    if      (n === "1") { reply = M.r5_1() + "\n\n" + M.cat5(); }
    else if (n === "2") { reply = M.r5_2() + "\n\n" + M.cat5(); }
    else if (n === "3") { reply = M.r5_3() + "\n\n" + M.cat5(); }
    else if (n === "4") { reply = M.r5_4() + "\n\n" + M.cat5(); }
    else if (n === "5") { reply = M.r5_5() + "\n\n" + M.cat5(); }
    else if (n === "0") { c.etapa = 220; reply = M.menu_cat(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.cat5(); }

  // ── E226: dúvidas sobre diagnóstico ─────────────────────────
  } else if (etapa === 226) {
    if      (n === "1") { reply = M.r6_1() + "\n\n" + M.cat6(); }
    else if (n === "2") { reply = M.r6_2() + "\n\n" + M.cat6(); }
    else if (n === "3") { reply = M.r6_3() + "\n\n" + M.cat6(); }
    else if (n === "4") { reply = M.r6_4() + "\n\n" + M.cat6(); }
    else if (n === "5") { reply = M.r6_5() + "\n\n" + M.cat6(); }
    else if (n === "0") { c.etapa = 220; reply = M.menu_cat(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.cat6(); }

  // ── E3: onde estão as restrições ────────────────────────────
  } else if (etapa === 3) {
    var locs = {"1":"Serasa","2":"SPC","3":"banco","4":"cartório","5":"não identificado"};
    if (locs[n]) {
      c.local = locs[n]; c.etapa = 4; reply = M.tempo();
    } else {
      reply = M.nao_entendi() + "\n\n" + M.onde();
    }

  // ── E4: há quanto tempo ─────────────────────────────────────
  } else if (etapa === 4) {
    if (n === "1" || n === "2" || n === "3") {
      c.etapa = 5; reply = M.tentou();
    } else {
      reply = M.nao_entendi() + "\n\n" + M.tempo();
    }

  // ── E5: já tentou resolver ──────────────────────────────────
  } else if (etapa === 5) {
    if (n === "1") {
      c.etapa = 50; reply = M.resp_sim(nome) + "\n\n" + M.ancora();
    } else if (n === "2") {
      c.etapa = 50; reply = M.resp_nao(nome) + "\n\n" + M.ancora();
    } else {
      reply = M.nao_entendi() + "\n\n" + M.tentou();
    }

  // ── E50: âncora emocional ───────────────────────────────────
  } else if (etapa === 50) {
    var mots = {"1":"Financiamento/empréstimo","2":"Cartão de crédito","3":"Oportunidade de trabalho","4":"Crédito no comércio","5":"Sair dessa situação"};
    c.motivo = mots[n] || "Limpar o nome";
    c.etapa  = 51;
    reply    = M.ancora_resp(c.motivo) + "\n\n" + M.valor_divida();

  // ── E51: valor da dívida ────────────────────────────────────
  } else if (etapa === 51) {
    var fxs = {"1":"Dívida de até R$ 1.000 —","2":"Dívida entre R$ 1–5 mil —","3":"Dívida entre R$ 5–20 mil —","4":"Dívida acima de R$ 20 mil —","5":"Valor a verificar —"};
    var f   = fxs[n] || "Dívida registrada —";
    c.dados = (c.dados || "") + " | Dívida: " + f;
    c.etapa = 6;
    reply   = M.posicionamento(nome);

  // ── E6: posicionamento + oferta diagnóstico ─────────────────
  } else if (etapa === 6) {
    if      (n === "1") { c.etapa = 7; reply = M.coletar_dados(); }
    else if (n === "2") { c.etapa = 61; reply = M.obj_valor(); }
    else if (n === "3") { c.etapa = 62; reply = M.obj_confiavel(); }
    else if (n === "4") { c.etapa = 63; reply = M.obj_ja_tentou(nome); }
    else if (n === "5") { c.etapa = 64; reply = M.obj_entender(); }
    else if (n === "6") { c.etapa = 65; reply = M.obj_pensar_50(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.posicionamento(nome); }

  // ── E61: objeção — valor R$50 ───────────────────────────────
  } else if (etapa === 61) {
    if      (n === "1") { c.etapa = 7; reply = M.coletar_dados(); }
    else if (n === "2") { c.etapa = 611; reply = M.obj_sem_50(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.obj_valor(); }

  } else if (etapa === 611) {
    if      (n === "1") { c.etapa = 7; reply = M.coletar_dados(); }
    else if (n === "2") { c.etapa = 0; reply = "Sem problema! Manda *Oi* quando estiver pronto. 😊"; }
    else                { reply = M.nao_entendi() + "\n\n" + M.obj_sem_50(); }

  // ── E62: objeção — confiável ────────────────────────────────
  } else if (etapa === 62) {
    if      (n === "1") { c.etapa = 7; reply = M.coletar_dados(); }
    else if (n === "2") { c.etapa = 64; reply = M.obj_entender(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.obj_confiavel(); }

  // ── E63: objeção — já tentei antes ─────────────────────────
  } else if (etapa === 63) {
    if      (n === "1") { c.etapa = 7; reply = M.coletar_dados(); }
    else if (n === "2") { c.etapa = 64; reply = M.obj_entender(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.obj_ja_tentou(nome); }

  // ── E64: objeção — entender melhor ─────────────────────────
  } else if (etapa === 64) {
    if      (n === "1") { c.etapa = 7; reply = M.coletar_dados(); }
    else if (n === "2") { c.etapa = 62; reply = M.obj_confiavel(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.obj_entender(); }

  // ── E65: objeção — preciso pensar ──────────────────────────
  } else if (etapa === 65) {
    if      (n === "1") { c.etapa = 611; reply = M.obj_sem_50(); }
    else if (n === "2") { c.etapa = 62; reply = M.obj_confiavel(); }
    else if (n === "3") { c.etapa = 64; reply = M.obj_entender(); }
    else if (n === "4") { c.etapa = 0; reply = M.urgencia() + "Sem problema! Manda *Oi* quando quiser. 😊"; }
    else                { reply = M.nao_entendi() + "\n\n" + M.obj_pensar_50(); }

  // ── E7: coleta nome completo + CPF ──────────────────────────
  } else if (etapa === 7) {
    var cpfM = rawMsg.match(/\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?\d{2}/);
    if (cpfM) c.cpf = cpfM[0];
    c.dados = (c.dados || "") + " | Dados: " + rawMsg;
    c.etapa = 8;
    reply   = M.pix50(BASE_URL + "/pix/50");

  // ── E8: comprovante R$50 — qualquer envio avança ─────────────
  } else if (etapa === 8) {
    c.etapa = 9;
    reply   = "Obrigado, " + nome + "! ✅\n\nEm alguns minutos você receberá a análise completa do seu CPF aqui mesmo. 😊";

  // ── E9: lead responde ao diagnóstico ────────────────────────
  } else if (etapa === 9) {
    if      (n === "1") { c.etapa = 12; reply = M.oferta_processo(nome); }
    else if (n === "2") { c.etapa = 91; reply = M.obj_diag(nome); }
    else                { reply = M.nao_entendi() + "\n\n" + M.diagnostico(nome); }

  } else if (etapa === 91) {
    if      (n === "1") { c.etapa = 12; reply = M.oferta_processo(nome); }
    else if (n === "2") { reply = "Pode me contar qual a dúvida específica? Estou aqui para explicar! 😊"; }
    else                { reply = M.nao_entendi() + "\n\n" + M.obj_diag(nome); }

  // ── E12: oferta processo completo ───────────────────────────
  } else if (etapa === 12) {
    if      (n === "1") { c.etapa = 13; reply = M.pix250(BASE_URL + "/pix/250"); }
    else if (n === "2") { c.etapa = 121; reply = M.obj_caro(nome); }
    else if (n === "3") { c.etapa = 122; reply = M.obj_falhar(); }
    else if (n === "4") { c.etapa = 123; reply = M.obj_tempo(); }
    else if (n === "5") { c.etapa = 124; reply = M.obj_contrato(); }
    else if (n === "6") { c.etapa = 125; reply = M.obj_pensar_250(nome); }
    else                { reply = M.nao_entendi() + "\n\n" + M.oferta_processo(nome); }

  // ── E121: objeção — caro ────────────────────────────────────
  } else if (etapa === 121) {
    if      (n === "1") { c.etapa = 13; reply = M.pix250(BASE_URL + "/pix/250"); }
    else if (n === "2") { c.etapa = 1211; reply = M.obj_sem_250(); }
    else                { reply = M.nao_entendi() + "\n\n" + M.obj_caro(nome); }

  } else if (etapa === 1211) {
    if      (n === "1") { c.etapa = 13; reply = M.pix250(BASE_URL + "/pix/250"); }
    else if (n === "2") { c.etapa = 0; reply = "Sem problema! Manda *Oi* quando estiver pronto. 😊"; }
    else                { reply = M.nao_entendi() + "\n\n" + M.obj_sem_250(); }

  // ── E122: objeção — e se não funcionar ─────────────────────
  } else if (etapa === 122) {
    if      (n === "1") { c.etapa = 13; reply = M.pix250(BASE_URL + "/pix/250"); }
    else if (n === "2") { c.etapa = 12; reply = M.oferta_processo(nome); }
    else                { reply = M.nao_entendi() + "\n\n" + M.obj_falhar(); }

  // ── E123: objeção — quanto tempo ───────────────────────────
  } else if (etapa === 123) {
    if      (n === "1") { c.etapa = 13; reply = M.pix250(BASE_URL + "/pix/250"); }
    else if (n === "2") { c.etapa = 12; reply = M.oferta_processo(nome); }
    else                { reply = M.nao_entendi() + "\n\n" + M.obj_tempo(); }

  // ── E124: objeção — contrato ────────────────────────────────
  } else if (etapa === 124) {
    if      (n === "1") { c.etapa = 13; reply = M.pix250(BASE_URL + "/pix/250"); }
    else if (n === "2") { c.etapa = 12; reply = M.oferta_processo(nome); }
    else                { reply = M.nao_entendi() + "\n\n" + M.obj_contrato(); }

  // ── E125: objeção — preciso pensar R$250 ───────────────────
  } else if (etapa === 125) {
    if      (n === "1") { c.etapa = 1211; reply = M.obj_sem_250(); }
    else if (n === "2") { c.etapa = 122; reply = M.obj_falhar(); }
    else if (n === "3") { c.modoHumano = true; reply = M.humano(); }
    else if (n === "4") { c.etapa = 0; reply = M.urgencia() + "Sem problema! Manda *Oi* quando quiser. 😊"; }
    else                { reply = M.nao_entendi() + "\n\n" + M.obj_pensar_250(nome); }

  // ── E13: comprovante R$250 — qualquer envio avança ──────────
  } else if (etapa === 13) {
    c.etapa = 14;
    reply   = M.pedir_rg(nome);

  // ── E14: foto do RG — qualquer envio avança ─────────────────
  } else if (etapa === 14) {
    c.etapa = 15;
    reply   = M.pedir_cpf_doc();

  // ── E15: foto do CPF — qualquer envio avança ────────────────
  } else if (etapa === 15) {
    c.etapa = 16;
    reply   = M.docs_ok(nome);

  // ── E16: processo oficialmente aberto ───────────────────────
  } else if (etapa === 16) {
    c.etapa        = 17;
    c.processStart = agora;
    reply          = M.fechamento(nome);

  // ── E17+: processo em andamento — atualizações automáticas ──
  } else if (etapa >= 17) {
    var dias = 0;
    if (c.processStart) {
      dias = Math.floor((agora - c.processStart) / (1000 * 60 * 60 * 24));
    }
    if (dias >= 25 && !c.upd25) {
      c.upd25 = true;
      reply   = M.upd_d25(nome);
    } else if (dias >= 15 && !c.upd15) {
      c.upd15 = true;
      reply   = M.upd_d15(nome);
    } else if (dias >= 7 && !c.upd7) {
      c.upd7 = true;
      reply  = M.upd_d7(nome);
    } else {
      reply = "Processo em andamento! ✅ Qualquer dúvida é só chamar, " + nome + ". Estamos com você! 💪";
    }

  } else {
    reply = M.nao_entendi();
  }

  c.tentativas = 0;
  c.ultimaMsg  = agora;
  await salvarContato(id, c);
  console.log("[" + id + "] E" + etapa + "→E" + c.etapa + " | \"" + reply.substring(0, 60) + "\"");
  return reply;
}

// ─────────────────────────────────────────────────────────────
//  WEBHOOK
// ─────────────────────────────────────────────────────────────
app.post("/webhook", async function(req, res) {
  try {
    var id    = identificarContato(req.body);
    var msg   = (req.body.message || "").trim();
    var reply = await processar(id, msg);
    res.json({ reply: reply || "" });
  } catch(err) {
    console.error("❌ Webhook:", err.message);
    res.status(200).json({ reply: "Desculpe, tive um problema técnico. Pode repetir?" });
  }
});

// ─────────────────────────────────────────────────────────────
//  PIX
// ─────────────────────────────────────────────────────────────
app.get("/pix/:v", async function(req, res) {
  try {
    var v = parseFloat(req.params.v);
    if (isNaN(v) || v <= 0) return res.status(400).send("Valor inválido");
    res.setHeader("Content-Type", "text/html;charset=utf-8");
    res.send(await paginaPix(v));
  } catch(e) {
    res.status(500).send("Erro: " + e.message);
  }
});

// ─────────────────────────────────────────────────────────────
//  ADMIN
// ─────────────────────────────────────────────────────────────
app.post("/assumir", async function(req, res) {
  var c = await lerContato(req.body.telefone);
  c.modoHumano = true;
  await salvarContato(req.body.telefone, c);
  res.json({ ok: true });
});

app.post("/liberar", async function(req, res) {
  var c = await lerContato(req.body.telefone);
  c.modoHumano = false;
  await salvarContato(req.body.telefone, c);
  res.json({ ok: true });
});

app.post("/resetar", async function(req, res) {
  await redis.del("l:" + req.body.telefone);
  res.json({ ok: true });
});

app.get("/debug", async function(req, res) {
  var rok = await redis.ping().then(function() { return true; }).catch(function() { return false; });
  res.json({ status: "ok", redis: rok, baseUrl: BASE_URL, node: process.version });
});

app.get("/", function(req, res) {
  res.send("🤖 JustHelp Bot — Online ✅");
});

// ─────────────────────────────────────────────────────────────
//  INICIAR
// ─────────────────────────────────────────────────────────────
var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("✅ JustHelp Bot | porta " + PORT);
});
