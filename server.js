const express = require("express");
const { Redis } = require("@upstash/redis");
const QRCode   = require("qrcode");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────────────────────
//  CONFIG
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
//  IDENTIFICAÇÃO ESTÁVEL
// ─────────────────────────────────────────────────────────────
function identificarContato(body) {
  console.log("📩 Body:", JSON.stringify(body).substring(0, 200));
  const campos = [body.phone, body.sender, body.from, body.number]
    .filter(Boolean).map(v => String(v).trim());

  for (const c of campos) {
    const d = c.replace(/\D/g, "");
    if (d.length >= 8) return d;
  }
  for (const c of campos) {
    if (c && c !== "WhatsAuto app" && c.length >= 3) {
      const id = c.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "").trim()
        .replace(/\s+/g, "_").substring(0, 40);
      if (id.length >= 3) return id;
    }
  }
  let h = 0;
  const raw = JSON.stringify(body);
  for (let i = 0; i < raw.length; i++) { h = ((h << 5) - h) + raw.charCodeAt(i); h |= 0; }
  return `anon_${Math.abs(h)}`;
}

// ─────────────────────────────────────────────────────────────
//  ESTADO
// ─────────────────────────────────────────────────────────────
function novoEstado() {
  return { etapa: 0, nome: "", cpf: "", local: "", dados: "", motivo: "",
    modoHumano: false, ultimaMsg: 0, tentativas: 0,
    processStart: null, upd7: false, upd15: false, upd25: false };
}
async function ler(id) {
  try { return { ...novoEstado(), ...(await redis.get(`l:${id}`) || {}) }; }
  catch { return novoEstado(); }
}
async function salvar(id, c) {
  try { await redis.set(`l:${id}`, c); }
  catch(e) { console.error("Redis:", e.message); }
}
function cap(t)   { return (t||"").trim().split(" ").map(p=>p.charAt(0).toUpperCase()+p.slice(1).toLowerCase()).join(" "); }
function isOi(m)  { return /^(oi|ol[aá]|oii+|bom dia|boa tarde|boa noite|hello|hi|opa|salve|al[oô]|menu|inicio|start|começar)[\s!?.]*$/i.test(m.trim()); }
function n1(m, n) { return m.replace(/[^0-9]/g,"") === String(n); }

// ─────────────────────────────────────────────────────────────
//  PIX
// ─────────────────────────────────────────────────────────────
function pf(id,v){return`${id}${String(v.length).padStart(2,"0")}${v}`;}
function pcrc(s){let c=0xFFFF;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021):(c<<1);}return(c&0xFFFF).toString(16).toUpperCase().padStart(4,"0");}
function pixPayload(v){const ma=pf("00","BR.GOV.BCB.PIX")+pf("01","justhelpadv@gmail.com");const p=pf("00","01")+pf("01","12")+pf("26",ma)+pf("52","0000")+pf("53","986")+pf("54",Number(v).toFixed(2))+pf("58","BR")+pf("59","JustHelp Adv")+pf("60","Sao Paulo")+pf("62",pf("05","JUSTHELPADV"))+"6304";return p+pcrc(p);}
async function paginaPix(valor){
  const code=pixPayload(valor);const qr=await QRCode.toDataURL(code,{width:260,margin:2});
  const label=valor==50?"Diagnóstico de CPF":"Entrada — Restauração de Crédito";
  return`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagar R$ ${Number(valor).toFixed(2).replace(".",",")} — JustHelp</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}.card{background:#fff;border-radius:20px;padding:28px 22px;max-width:360px;width:100%;text-align:center}.logo{background:#1D7874;color:#fff;border-radius:10px;padding:8px 18px;display:inline-block;font-weight:700;font-size:17px;margin-bottom:14px}.valor{font-size:36px;font-weight:700;color:#1D7874}.sub{color:#888;font-size:13px;margin-bottom:18px}.qr{background:#f8f9fa;border-radius:14px;padding:14px;display:inline-block;margin-bottom:16px}.qr img{display:block;width:230px;height:230px}.steps{text-align:left;margin-bottom:14px}.step{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#444}.step:last-child{border:none}.n{background:#1D7874;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px}.copia{background:#f8f9fa;border-radius:10px;padding:10px;font-family:monospace;font-size:10px;color:#333;word-break:break-all;margin-bottom:10px;text-align:left;line-height:1.5}.btn{width:100%;padding:14px;border-radius:10px;border:none;font-size:15px;font-weight:700;cursor:pointer;background:#1D7874;color:#fff}.ok{background:#22c55e}.aviso{font-size:11px;color:#aaa;margin-top:12px}</style></head><body><div class="card"><div class="logo">JustHelp</div><div class="valor">R$ ${Number(valor).toFixed(2).replace(".",",")}</div><div class="sub">${label}</div><div class="qr"><img src="${qr}" alt="QR Pix"></div><div class="steps"><div class="step"><span class="n">1</span><span>Abra seu banco ou app</span></div><div class="step"><span class="n">2</span><span>Pix → QR Code ou Copia e Cola</span></div><div class="step"><span class="n">3</span><span>Confirme e pague</span></div></div><div class="copia" id="cod">${code}</div><button class="btn" id="btn" onclick="copy()">📋 Copiar código Pix</button><div class="aviso">⚠️ Após pagar, volte ao WhatsApp e envie o comprovante.</div></div><script>function copy(){navigator.clipboard.writeText(document.getElementById('cod').textContent).then(()=>{const b=document.getElementById('btn');b.textContent='✅ Copiado!';b.classList.add('ok');setTimeout(()=>{b.textContent='📋 Copiar código Pix';b.classList.remove('ok')},3000)})}</script></body></html>`;
}

// ─────────────────────────────────────────────────────────────
//  MENSAGENS — curtas e objetivas
// ─────────────────────────────────────────────────────────────
const M = {
  inicio:        ()  => `Olá! 👋 Bem-vindo à *JustHelp*. Me fala seu *nome*. 😊`,
  menu:          (n) => `Oi, *${n}*! Como posso te ajudar?\n\n1️⃣ Quero limpar meu nome\n2️⃣ Como funciona`,
  como_funciona: ()  => `Fazemos *análise jurídica* das dívidas — identificamos irregularidades e pedimos a *remoção dos apontamentos* do Serasa, SPC e outros. Você volta a ter crédito! ⚖️\n📈 Bônus: aumento de score incluso.\n\n1️⃣ Quero fazer o diagnóstico\n2️⃣ Voltar`,
  onde:          ()  => `Onde estão suas restrições?\n\n1️⃣ Serasa\n2️⃣ SPC\n3️⃣ Banco\n4️⃣ Cartório\n5️⃣ Não sei`,
  tempo:         ()  => `Há quanto tempo está negativado?\n\n1️⃣ Menos de 1 ano\n2️⃣ 1 a 3 anos\n3️⃣ Mais de 3 anos`,
  tentou:        ()  => `Já tentou resolver antes?\n\n1️⃣ Sim, tentei renegociar\n2️⃣ Não, primeira vez`,
  resp_sim:      (n) => `Entendo, ${n}. Renegociação não resolve — a dívida continua lá. Nosso trabalho é jurídico: encontramos os erros e pedimos a *remoção*. É diferente! 💪`,
  resp_nao:      (n) => `Boa notícia, ${n} — você está no lugar certo! 😊`,
  ancora:        ()  => `Por que limpar o nome é importante pra você agora? 🎯\n\n1️⃣ Financiamento/empréstimo\n2️⃣ Cartão de crédito\n3️⃣ Oportunidade de trabalho\n4️⃣ Crédito no comércio\n5️⃣ Me livrar dessa situação`,
  ancora_resp:   (m) => `*${m}* — ótimo motivo! Quanto antes agir, mais rápido isso vira realidade. 💪`,
  valor_divida:  ()  => `Valor aproximado das suas dívidas?\n\n1️⃣ Até R$ 1.000\n2️⃣ R$ 1–5 mil\n3️⃣ R$ 5–20 mil\n4️⃣ Acima de R$ 20 mil\n5️⃣ Não sei`,
  valor_resp:    (f) => `${f} anotado! 🔍`,
  depoimentos:   ()  => `Veja o que dizem nossos clientes: 💬\n\n⭐ *"Nome limpo em 22 dias. Consegui meu cartão."* — Carlos, SP\n⭐ *"18 dias e já fiz meu financiamento."* — Fernanda, RJ\n⭐ *"Tentei renegociar por anos. Com a JustHelp saiu em 1 mês."* — Roberto, MG`,
  posicionamento:(n) => `${n}, primeiro passo: *diagnóstico completo do seu CPF* por *R$ 50*. 🔍\n\nSe seguir com o processo, esse valor já vem *abatido*.\n\n1️⃣ Quero fazer o diagnóstico\n2️⃣ Dúvida sobre o valor\n3️⃣ Não sei se é confiável\n4️⃣ Já tentei antes\n5️⃣ Como funciona?\n6️⃣ Preciso pensar`,
  obj_valor:     ()  => `R$ 50 é menos que uma consulta médica. Se não houver viabilidade, você sabe *antes* de gastar mais. E se seguir, vem *abatido*.\n\n1️⃣ Quero o diagnóstico\n2️⃣ Não tenho agora`,
  obj_sem_50:    ()  => `Sem problema! Manda *Oi* quando estiver pronto. 😊\n\n1️⃣ Consigo sim — quero agora\n2️⃣ Volto depois`,
  obj_confiavel: ()  => `Somos escritório jurídico registrado. O R$ 50 é para você ver a viabilidade *antes* de investir mais. Se não funcionar, não gasta mais nada.\n\n1️⃣ Quero fazer\n2️⃣ Quero entender melhor`,
  obj_ja_tentou: (n) => `${n}, tentou *renegociação*? Isso não remove — a dívida fica lá. Nosso trabalho é jurídico: removemos os *apontamentos*. É diferente! 💪\n\n1️⃣ Quero tentar\n2️⃣ Ainda tenho dúvidas`,
  obj_entender:  ()  => `3 passos:\n*1.* Diagnóstico R$ 50\n*2.* Processo jurídico — entrada R$ 250\n*3.* R$ 450 de êxito *só após resultado* 📈\n\n1️⃣ Quero começar\n2️⃣ Ainda tenho dúvida`,
  obj_pensar_50: ()  => `O que está te travando?\n\n1️⃣ Questão financeira\n2️⃣ Não confio ainda\n3️⃣ Quero entender melhor\n4️⃣ Volto depois`,
  urgencia:      ()  => `⚠️ Temos vagas limitadas por dia. *1 vaga disponível* agora!\n`,
  coletar_dados: ()  => `Ótimo! Me envia seu *nome completo* e *CPF*. 📋`,
  pix50:         (u) => `💳 *R$ 50*\n👇 Pague aqui:\n${u}\n\nEnvie o comprovante depois. 📸`,
  analisando_1:  (n) => `✅ Confirmado! Analisando seu CPF, ${n}... 🔍`,
  analisando_2:  ()  => `🔎 Verificando Serasa...`,
  analisando_3:  ()  => `🔎 Verificando SPC e bancos...`,
  analisando_4:  ()  => `🔎 Verificando irregularidades jurídicas...`,
  diagnostico:   (n) => `📊 *DIAGNÓSTICO — ${n.toUpperCase()}*\n\n✅ Restrições identificadas\n✅ Irregularidades detectadas\n✅ Viabilidade: *FAVORÁVEL*\n\n1️⃣ Quero saber o próximo passo\n2️⃣ Tenho dúvidas`,
  obj_diag:      (n) => `${n}, identificamos pontos com possibilidade de atuação jurídica. Não garantimos 100%, mas o cenário é *favorável*. 😊\n\n1️⃣ Quero avançar\n2️⃣ Ainda tenho dúvidas`,
  oferta_processo:(n)=> `${n}, para liberar seu nome: ⚖️\n\n▶ *Entrada:* R$ 250\n▶ *Êxito:* R$ 450 _(só após resultado)_\n▶ R$ 50 já abatidos!\n▶ Prazo: *30 dias úteis*\n▶ Score: bônus incluso 📈\n\n⚠️ Sem resultado = sem cobrança do êxito.\n\n1️⃣ Quero entrar\n2️⃣ Valor alto\n3️⃣ E se não funcionar?\n4️⃣ Quanto tempo?\n5️⃣ Como é o contrato?\n6️⃣ Preciso pensar`,
  obj_caro:      (n) => `${n}, com nome limpo: cartão, financiamento, crédito. Vale mais que R$ 250. E os R$ 450 só pagam *após resultado*.\n\n1️⃣ Quero entrar\n2️⃣ Não tenho agora`,
  obj_sem_250:   ()  => `Sem problema! Manda *Oi* quando puder. 😊\n\n1️⃣ Consigo sim — quero entrar\n2️⃣ Volto depois`,
  obj_falhar:    ()  => `R$ 450 só cobrado *se funcionar*. Se não funcionar, não paga. Nosso risco é maior que o seu. 💪\n\n1️⃣ Entendi, quero entrar\n2️⃣ Ainda tenho dúvida`,
  obj_tempo:     ()  => `Até *30 dias úteis*. Casos simples, menos de 15. Processo começa *no mesmo dia*. ⚡\n\n1️⃣ Ótimo, quero começar\n2️⃣ Preciso pensar`,
  obj_contrato:  ()  => `Contrato digital com:\n✅ Prazo garantido\n✅ Cláusula de êxito\n✅ Política de cancelamento\n\n1️⃣ Quero assinar\n2️⃣ Tenho dúvidas`,
  obj_pensar_250:(n) => `${n}, o que está te travando?\n\n1️⃣ Financeiro\n2️⃣ Dúvida sobre o processo\n3️⃣ Quero consultar alguém\n4️⃣ Volto depois`,
  pix250:        (u) => `🎉 Ótimo!\n\n💳 *Entrada: R$ 250*\n👇 Pague aqui:\n${u}\n\nEnvie o comprovante. 📸`,
  pedir_rg:      (n) => `✅ Entrada confirmada! Obrigado, ${n}!\n\nPara o contrato, envie uma foto do *RG (frente e verso)*. 📸`,
  pedir_cpf_doc: ()  => `Agora a foto do *CPF*. 📸`,
  docs_ok:       (n) => `Documentos recebidos! ✅ Preparando seu contrato, ${n}.`,
  fechamento:    (n) => `🎉 *${n}, processo ABERTO!*\n\n⚖️ Equipe jurídica trabalhando na remoção dos apontamentos\n📅 Prazo: até 30 dias úteis\n📈 Bônus de score incluso\n💰 R$ 450 só após resultado\n\nQualquer dúvida, pode chamar! 😊`,
  upd_d7:        (n) => `Oi, *${n}*! 👋 Processo há 7 dias em andamento. Tudo certo! Qualquer dúvida é só chamar. 😊`,
  upd_d15:       (n) => `*${n}*, 15 dias de processo! Estamos na fase jurídica. Em breve novidades! 💪`,
  upd_d25:       (n) => `*${n}*, reta final! 25 dias. Concluindo os procedimentos. Resultado em breve! 😊`,
  menu_retorno:  (n) => `Certo, *${n}*! Por onde quer continuar?\n\n1️⃣ Fazer o diagnóstico\n2️⃣ Entender como funciona\n3️⃣ Tenho dúvidas`,
  menu_cat:      ()  => `Qual é a sua dúvida? 😊\n\n1️⃣ Sobre o serviço\n2️⃣ Confiança e segurança\n3️⃣ Valores e prazo\n4️⃣ Contrato e garantias\n5️⃣ Sobre o resultado\n6️⃣ Sobre o diagnóstico R$ 50\n\n7️⃣ Já sei — quero começar!`,
  cat1: () => `*Serviço:* ⚖️\n\n1️⃣ O que vocês fazem?\n2️⃣ Preciso pagar a dívida?\n3️⃣ Funciona pra qualquer dívida?\n4️⃣ E se tiver muitas dívidas?\n5️⃣ Funciona pra dívida antiga?\n\n0️⃣ Voltar`,
  cat2: () => `*Confiança:* 🔒\n\n1️⃣ Como sei que não é golpe?\n2️⃣ São escritório registrado?\n3️⃣ Já atenderam outros?\n4️⃣ Por que só R$ 50 no início?\n5️⃣ Meus dados ficam seguros?\n\n0️⃣ Voltar`,
  cat3: () => `*Valores e prazo:* 💰\n\n1️⃣ Quanto custa no total?\n2️⃣ Quanto tempo demora?\n3️⃣ Quando começa?\n4️⃣ Se não funcionar, perco tudo?\n5️⃣ Posso parcelar?\n\n0️⃣ Voltar`,
  cat4: () => `*Contrato:* 📄\n\n1️⃣ Como funciona o contrato?\n2️⃣ Tenho garantia por escrito?\n3️⃣ Posso cancelar?\n4️⃣ O que preciso enviar?\n5️⃣ Como recebo o contrato?\n\n0️⃣ Voltar`,
  cat5: () => `*Resultado:* 🏆\n\n1️⃣ Como fico sabendo?\n2️⃣ Remove de todos os órgãos?\n3️⃣ Como funciona o bônus de score?\n4️⃣ O que acontece com a dívida?\n5️⃣ Posso pedir crédito logo após?\n\n0️⃣ Voltar`,
  cat6: () => `*Diagnóstico R$ 50:* 🔍\n\n1️⃣ O que é exatamente?\n2️⃣ O R$ 50 é devolvido?\n3️⃣ E se não houver viabilidade?\n4️⃣ É imediato?\n5️⃣ Preciso enviar documentos?\n\n0️⃣ Voltar`,
  r1_1: () => `Analisamos dívidas juridicamente, identificamos irregularidades e pedimos a *remoção dos apontamentos* do Serasa/SPC. Nome limpo, crédito disponível. 🎯`,
  r1_2: () => `*Não precisa pagar.* 🙅 Removemos os *apontamentos* — a dívida pode existir, mas sem te impedir de ter crédito. ✅`,
  r1_3: () => `Sim — cartão, banco, financeira, loja, operadora. O diagnóstico mostra quais têm viabilidade no seu caso. 🔍`,
  r1_4: () => `Quanto mais restrições, *maior o potencial de atuação*! 💪 Analisamos todas no diagnóstico.`,
  r1_5: () => `Funciona nos dois casos! Antigas: maior chance de prescrição. Recentes: verificamos juros abusivos e cobranças indevidas. ✅`,
  r2_1: () => `Cobramos R$ 50 primeiro (não R$ 500 de cara). Contrato formal. Processo completo só paga após resultado. Fraude pede valor alto de cara — nós não. ✅`,
  r2_2: () => `Sim, escritório jurídico registrado. Atuamos pelo Código de Defesa do Consumidor. 📋`,
  r2_3: () => `Sim, centenas de clientes atendidos. Muitos vieram frustrados de renegociações e conseguiram resultado. 🎉`,
  r2_4: () => `O R$ 50 cobre a análise real. Não faz sentido cobrar R$ 250 sem confirmar viabilidade primeiro. 💡`,
  r2_5: () => `Dados 100% seguros. 🔐 Usamos só para análise e contrato. Seguimos a LGPD.`,
  r3_1: () => `💰 Diagnóstico: *R$ 50* (abatido)
Entrada: *R$ 250*
Êxito: *R$ 450* (só após resultado)
*Total real: R$ 650*`,
  r3_2: () => `Até *30 dias úteis*. A maioria resolve antes. Casos simples, menos de 15 dias. ⏱️`,
  r3_3: () => `*No mesmo dia* do pagamento da entrada. ⚡`,
  r3_4: () => `Perde só os *R$ 250 de entrada*. Os R$ 450 de êxito *não são cobrados* se não funcionar. 💪`,
  r3_5: () => `Só à vista via Pix. Mas em etapas: R$ 50 agora, R$ 250 na entrada, R$ 450 só no final. 😊`,
  r4_1: () => `Contrato digital com: prazo garantido, cláusula de êxito, obrigações das partes e política de cancelamento. 📋`,
  r4_2: () => `Sim, por escrito. R$ 450 cobrado *somente após* remoção comprovada. ✅`,
  r4_3: () => `Sim, pode cancelar. O contrato tem política clara. 📋`,
  r4_4: () => `Só foto do *RG* (frente/verso) e foto do *CPF* — aqui pelo WhatsApp. Nada mais.`,
  r4_5: () => `Digital, aqui pelo WhatsApp. Você assina e recebe uma cópia.`,
  r5_1: () => `Aqui pelo WhatsApp. 📲 Enviamos atualizações quando os apontamentos forem removidos.`,
  r5_2: () => `Sim! Serasa, SPC, Boa Vista, Quod e demais. ✅`,
  r5_3: () => `Após a remoção, orientamos as melhores práticas para aumentar o score. Alguns clientes chegam a 700+. 📈`,
  r5_4: () => `A dívida pode continuar existindo, mas *sem te impedir de ter crédito*. Os apontamentos removidos = mercado te enxerga como apto. ✅`,
  r5_5: () => `Sim! Cartão, financiamento, crédito no comércio — tudo disponível imediatamente. 🎉`,
  r6_1: () => `Análise completa do CPF: apontamentos ativos, origem das dívidas, irregularidades jurídicas e viabilidade de remoção. 🔍`,
  r6_2: () => `Não é devolvido, mas é *abatido* se seguir com o processo. Na prática não paga duas vezes. 💡`,
  r6_3: () => `Se não houver viabilidade, você sabe e não gasta mais nada além dos R$ 50. 🙏`,
  r6_4: () => `Feita logo após a confirmação do pagamento. Resultado *nessa conversa* em instantes. ⚡`,
  r6_5: () => `Não precisa enviar nada. Só *nome completo e CPF* aqui no chat. 😊`,
  reativacao:    (n) => `Oi, *${n}*! 😊 Ainda tenho vaga disponível. Quer continuar?\n\n1️⃣ Sim, vamos lá\n2️⃣ Ainda não`,
  humano:        ()  => `👋 Conectando com um especialista...`,
  nao_entendi:   ()  => `Responde com o *número* da opção. 😊`,
};

// ─────────────────────────────────────────────────────────────
//  FLUXO COMPLETO
// ─────────────────────────────────────────────────────────────
async function processar(id, rawMsg) {
  const msg   = rawMsg.toLowerCase().trim();
  const c     = await ler(id);
  let { etapa, nome: n } = c;
  let reply   = "";
  const agora = Date.now();

  // Modo humano — bot silencioso
  if (c.modoHumano) return "";

  // Pedido de humano
  if (/humano|atendente|falar com (algu[eé]m|pessoa)/i.test(rawMsg)) {
    c.modoHumano = true; await salvar(id, c); return M.humano();
  }

  // Reativação após 2h
  const inativo = c.ultimaMsg && (agora - c.ultimaMsg) > 2*60*60*1000;
  c.ultimaMsg   = agora;
  if (inativo && etapa >= 4 && etapa <= 7 && !isOi(rawMsg)) {
    c.tentativas = (c.tentativas||0)+1;
    if (c.tentativas <= 2) { await salvar(id,c); return M.reativacao(n); }
  }

  // Reinício
  if (etapa === 0 || isOi(rawMsg)) {
    const novo = novoEstado(); novo.etapa = 1; novo.ultimaMsg = agora;
    await salvar(id, novo); return M.inicio();
  }

  // ── E1: nome ────────────────────────────────────────────────
  if (etapa === 1) {
    n = cap(rawMsg); c.nome = n; c.etapa = 2; reply = M.menu(n);

  // ── E2: menu ────────────────────────────────────────────────
  } else if (etapa === 2) {
    if      (n1(msg,"1")) { c.etapa=3; reply=M.onde(); }
    else if (n1(msg,"2")) { c.etapa=20; reply=M.como_funciona(); }
    else                  { reply=M.nao_entendi()+"\n\n"+M.menu(n); }

  // ── E20: como funciona ──────────────────────────────────────
  } else if (etapa === 20) {
    if      (n1(msg,"1")) { c.etapa=3; reply=M.onde(); }
    else if (n1(msg,"2")) { c.etapa=21; reply=M.menu_retorno(n); }
    else                  { reply=M.nao_entendi()+"\n\n"+M.como_funciona(); }

  // ── E21: menu retorno ───────────────────────────────────────
  } else if (etapa === 21) {
    if      (n1(msg,"1")) { c.etapa=3; reply=M.onde(); }
    else if (n1(msg,"2")) { c.etapa=20; reply=M.como_funciona(); }
    else if (n1(msg,"3")) { c.etapa=220; reply=M.menu_cat(); }
    else                  { reply=M.nao_entendi()+"\n\n"+M.menu_retorno(n); }

  // ── E220: categorias dúvidas ────────────────────────────────
  } else if (etapa === 220) {
    if      (n1(msg,"1")) { c.etapa=221; reply=M.cat1(); }
    else if (n1(msg,"2")) { c.etapa=222; reply=M.cat2(); }
    else if (n1(msg,"3")) { c.etapa=223; reply=M.cat3(); }
    else if (n1(msg,"4")) { c.etapa=224; reply=M.cat4(); }
    else if (n1(msg,"5")) { c.etapa=225; reply=M.cat5(); }
    else if (n1(msg,"6")) { c.etapa=226; reply=M.cat6(); }
    else if (n1(msg,"7")) { c.etapa=3; reply=M.onde(); }
    else                  { reply=M.nao_entendi()+"\n\n"+M.menu_cat(); }

  // ── E221-226: respostas categorias ──────────────────────────
  } else if (etapa === 221) {
    const rs={"1":M.r1_1,"2":M.r1_2,"3":M.r1_3,"4":M.r1_4,"5":M.r1_5};
    if (rs[msg.replace(/[^0-9]/g,"")]) { reply=rs[msg.replace(/[^0-9]/g,"")]()+"\\n\\n"+M.cat1(); }
    else if (msg.replace(/[^0-9]/g,"")==="0") { c.etapa=220; reply=M.menu_cat(); }
    else { reply=M.nao_entendi()+"\n\n"+M.cat1(); }
  } else if (etapa === 222) {
    const rs={"1":M.r2_1,"2":M.r2_2,"3":M.r2_3,"4":M.r2_4,"5":M.r2_5};
    if (rs[msg.replace(/[^0-9]/g,"")]) { reply=rs[msg.replace(/[^0-9]/g,"")]()+"\\n\\n"+M.cat2(); }
    else if (msg.replace(/[^0-9]/g,"")==="0") { c.etapa=220; reply=M.menu_cat(); }
    else { reply=M.nao_entendi()+"\n\n"+M.cat2(); }
  } else if (etapa === 223) {
    const rs={"1":M.r3_1,"2":M.r3_2,"3":M.r3_3,"4":M.r3_4,"5":M.r3_5};
    if (rs[msg.replace(/[^0-9]/g,"")]) { reply=rs[msg.replace(/[^0-9]/g,"")]()+"\\n\\n"+M.cat3(); }
    else if (msg.replace(/[^0-9]/g,"")==="0") { c.etapa=220; reply=M.menu_cat(); }
    else { reply=M.nao_entendi()+"\n\n"+M.cat3(); }
  } else if (etapa === 224) {
    const rs={"1":M.r4_1,"2":M.r4_2,"3":M.r4_3,"4":M.r4_4,"5":M.r4_5};
    if (rs[msg.replace(/[^0-9]/g,"")]) { reply=rs[msg.replace(/[^0-9]/g,"")]()+"\\n\\n"+M.cat4(); }
    else if (msg.replace(/[^0-9]/g,"")==="0") { c.etapa=220; reply=M.menu_cat(); }
    else { reply=M.nao_entendi()+"\n\n"+M.cat4(); }
  } else if (etapa === 225) {
    const rs={"1":M.r5_1,"2":M.r5_2,"3":M.r5_3,"4":M.r5_4,"5":M.r5_5};
    if (rs[msg.replace(/[^0-9]/g,"")]) { reply=rs[msg.replace(/[^0-9]/g,"")]()+"\\n\\n"+M.cat5(); }
    else if (msg.replace(/[^0-9]/g,"")==="0") { c.etapa=220; reply=M.menu_cat(); }
    else { reply=M.nao_entendi()+"\n\n"+M.cat5(); }
  } else if (etapa === 226) {
    const rs={"1":M.r6_1,"2":M.r6_2,"3":M.r6_3,"4":M.r6_4,"5":M.r6_5};
    if (rs[msg.replace(/[^0-9]/g,"")]) { reply=rs[msg.replace(/[^0-9]/g,"")]()+"\\n\\n"+M.cat6(); }
    else if (msg.replace(/[^0-9]/g,"")==="0") { c.etapa=220; reply=M.menu_cat(); }
    else { reply=M.nao_entendi()+"\n\n"+M.cat6(); }

  // ── E3: onde restrições ─────────────────────────────────────
  } else if (etapa === 3) {
    const loc={"1":"Serasa","2":"SPC","3":"banco","4":"cartório","5":"não identificado"};
    const k=rawMsg.replace(/[^0-9]/g,"");
    if (loc[k]) { c.local=loc[k]; c.etapa=4; reply=M.tempo(); }
    else        { reply=M.nao_entendi()+"\n\n"+M.onde(); }

  // ── E4: tempo ───────────────────────────────────────────────
  } else if (etapa === 4) {
    if (["1","2","3"].includes(rawMsg.replace(/[^0-9]/g,""))) { c.etapa=5; reply=M.tentou(); }
    else { reply=M.nao_entendi()+"\n\n"+M.tempo(); }

  // ── E5: já tentou ───────────────────────────────────────────
  } else if (etapa === 5) {
    if      (n1(msg,"1")) { c.etapa=50; reply=M.resp_sim(n)+"\n\n"+M.ancora(); }
    else if (n1(msg,"2")) { c.etapa=50; reply=M.resp_nao(n)+"\n\n"+M.ancora(); }
    else                  { reply=M.nao_entendi()+"\n\n"+M.tentou(); }

  // ── E50: âncora ─────────────────────────────────────────────
  } else if (etapa === 50) {
    const mot={"1":"Financiamento/empréstimo","2":"Cartão de crédito","3":"Oportunidade de trabalho","4":"Crédito no comércio","5":"Sair dessa situação"};
    c.motivo=mot[rawMsg.replace(/[^0-9]/g,"")]||"Limpar o nome";
    c.etapa=51; reply=M.ancora_resp(c.motivo)+"\n\n"+M.valor_divida();

  // ── E51: valor dívida ───────────────────────────────────────
  } else if (etapa === 51) {
    const fxs={"1":"Dívida de até R$ 1.000 —","2":"Dívida entre R$ 1–5 mil —","3":"Dívida entre R$ 5–20 mil —","4":"Dívida acima de R$ 20 mil —","5":"Valor a verificar —"};
    const f=fxs[rawMsg.replace(/[^0-9]/g,"")]||"Dívida registrada —";
    c.dados+=` | Dívida: ${f}`; c.etapa=6;
    reply=M.valor_resp(f)+"\n\n"+M.depoimentos()+"\n\n"+M.posicionamento(n);

  // ── E6: oferta diagnóstico ──────────────────────────────────
  } else if (etapa === 6) {
    if      (n1(msg,"1")) { c.etapa=7; reply=M.coletar_dados(); }
    else if (n1(msg,"2")) { c.etapa=61; reply=M.obj_valor(); }
    else if (n1(msg,"3")) { c.etapa=62; reply=M.obj_confiavel(); }
    else if (n1(msg,"4")) { c.etapa=63; reply=M.obj_ja_tentou(n); }
    else if (n1(msg,"5")) { c.etapa=64; reply=M.obj_entender(); }
    else if (n1(msg,"6")) { c.etapa=65; reply=M.obj_pensar_50(); }
    else                  { reply=M.nao_entendi()+"\n\n"+M.posicionamento(n); }

  // ── Objeções diagnóstico ────────────────────────────────────
  } else if (etapa === 61) {
    if      (n1(msg,"1")) { c.etapa=7; reply=M.coletar_dados(); }
    else if (n1(msg,"2")) { c.etapa=611; reply=M.obj_sem_50(); }
    else                  { reply=M.nao_entendi()+"\n\n"+M.obj_valor(); }
  } else if (etapa === 611) {
    if      (n1(msg,"1")) { c.etapa=7; reply=M.coletar_dados(); }
    else if (n1(msg,"2")) { reply=`Manda *Oi* quando estiver pronto. 😊`; c.etapa=0; }
    else                  { reply=M.nao_entendi()+"\n\n"+M.obj_sem_50(); }
  } else if (etapa === 62) {
    if      (n1(msg,"1")) { c.etapa=7; reply=M.coletar_dados(); }
    else if (n1(msg,"2")) { c.etapa=64; reply=M.obj_entender(); }
    else                  { reply=M.nao_entendi()+"\n\n"+M.obj_confiavel(); }
  } else if (etapa === 63) {
    if      (n1(msg,"1")) { c.etapa=7; reply=M.coletar_dados(); }
    else if (n1(msg,"2")) { c.etapa=64; reply=M.obj_entender(); }
    else                  { reply=M.nao_entendi()+"\n\n"+M.obj_ja_tentou(n); }
  } else if (etapa === 64) {
    if      (n1(msg,"1")) { c.etapa=7; reply=M.coletar_dados(); }
    else if (n1(msg,"2")) { c.etapa=62; reply=M.obj_confiavel(); }
    else                  { reply=M.nao_entendi()+"\n\n"+M.obj_entender(); }
  } else if (etapa === 65) {
    if      (n1(msg,"1")) { c.etapa=611; reply=M.obj_sem_50(); }
    else if (n1(msg,"2")) { c.etapa=62; reply=M.obj_confiavel(); }
    else if (n1(msg,"3")) { c.etapa=64; reply=M.obj_entender(); }
    else if (n1(msg,"4")) { reply=M.urgencia()+`Manda *Oi* quando quiser. 😊`; c.etapa=0; }
    else                  { reply=M.nao_entendi()+"\n\n"+M.obj_pensar_50(); }

  // ── E7: coleta nome + CPF ───────────────────────────────────
  } else if (etapa === 7) {
    const cpfM=rawMsg.match(/\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?\d{2}/);
    if (cpfM) c.cpf=cpfM[0];
    c.dados+=` | Dados: ${rawMsg}`; c.etapa=8;
    reply=M.pix50(`${BASE_URL}/pix/50`);

  // ── E8: comprovante R$50 — transfere para assistente ────────
  } else if (etapa === 8) {
    c.etapa      = 9;
    c.modoHumano = true;
    reply = M.confirmado_pix50(n);

  // ── E9+: assistente jurídico assumiu ────────────────────────
  // O assistente pode continuar o fluxo manualmente ou
  // usar /liberar para reativar o bot na fase do processo completo
  } else if (etapa >= 9 && !c.modoHumano) {
    // Bot reativado pelo assistente — continua com oferta do processo
    if (etapa === 9) {
      reply = M.analisando_1(n)+"\n\n"+M.analisando_2()+"\n\n"+M.analisando_3()+"\n\n"+M.analisando_4()+"\n\n"+M.diagnostico(n);
      c.etapa = 10;
    } else if (etapa === 10) {
      if      (n1(msg,"1")) { c.etapa=12; reply=M.oferta_processo(n); }
      else if (n1(msg,"2")) { c.etapa=101; reply=M.obj_diag(n); }
      else                  { reply=M.nao_entendi()+"\n\n"+M.diagnostico(n); }
    } else if (etapa === 101) {
      if      (n1(msg,"1")) { c.etapa=12; reply=M.oferta_processo(n); }
      else                  { reply=`Pode me contar qual a dúvida específica? 😊`; }

    // Oferta R$250
    } else if (etapa === 12) {
      if      (n1(msg,"1")) { c.etapa=13; reply=M.pix250(`${BASE_URL}/pix/250`); }
      else if (n1(msg,"2")) { c.etapa=121; reply=M.obj_caro(n); }
      else if (n1(msg,"3")) { c.etapa=122; reply=M.obj_falhar(); }
      else if (n1(msg,"4")) { c.etapa=123; reply=M.obj_tempo(); }
      else if (n1(msg,"5")) { c.etapa=124; reply=M.obj_contrato(); }
      else if (n1(msg,"6")) { c.etapa=125; reply=M.obj_pensar_250(n); }
      else                  { reply=M.nao_entendi()+"\n\n"+M.oferta_processo(n); }
    } else if (etapa === 121) {
      if      (n1(msg,"1")) { c.etapa=13; reply=M.pix250(`${BASE_URL}/pix/250`); }
      else if (n1(msg,"2")) { c.etapa=1211; reply=M.obj_sem_250(); }
      else                  { reply=M.nao_entendi()+"\n\n"+M.obj_caro(n); }
    } else if (etapa === 1211) {
      if      (n1(msg,"1")) { c.etapa=13; reply=M.pix250(`${BASE_URL}/pix/250`); }
      else if (n1(msg,"2")) { reply=`Manda *Oi* quando estiver pronto. 😊`; c.etapa=0; }
      else                  { reply=M.nao_entendi()+"\n\n"+M.obj_sem_250(); }
    } else if (etapa === 122) {
      if      (n1(msg,"1")) { c.etapa=13; reply=M.pix250(`${BASE_URL}/pix/250`); }
      else if (n1(msg,"2")) { c.etapa=12; reply=M.oferta_processo(n); }
      else                  { reply=M.nao_entendi()+"\n\n"+M.obj_falhar(); }
    } else if (etapa === 123) {
      if      (n1(msg,"1")) { c.etapa=13; reply=M.pix250(`${BASE_URL}/pix/250`); }
      else if (n1(msg,"2")) { c.etapa=12; reply=M.oferta_processo(n); }
      else                  { reply=M.nao_entendi()+"\n\n"+M.obj_tempo(); }
    } else if (etapa === 124) {
      if      (n1(msg,"1")) { c.etapa=13; reply=M.pix250(`${BASE_URL}/pix/250`); }
      else if (n1(msg,"2")) { c.etapa=12; reply=M.oferta_processo(n); }
      else                  { reply=M.nao_entendi()+"\n\n"+M.obj_contrato(); }
    } else if (etapa === 125) {
      if      (n1(msg,"1")) { c.etapa=1211; reply=M.obj_sem_250(); }
      else if (n1(msg,"2")) { c.etapa=122; reply=M.obj_falhar(); }
      else if (n1(msg,"3")) { c.modoHumano=true; reply=M.humano(); }
      else if (n1(msg,"4")) { reply=M.urgencia()+`Manda *Oi* quando quiser. 😊`; c.etapa=0; }
      else                  { reply=M.nao_entendi()+"\n\n"+M.obj_pensar_250(n); }

    // Comprovante R$250 e documentos
    } else if (etapa === 13) {
        c.etapa=14; reply=M.pedir_rg(n);
    } else if (etapa === 14) { c.etapa=15; reply=M.pedir_cpf_doc();
    } else if (etapa === 15) { c.etapa=16; reply=M.docs_ok(n);
    } else if (etapa === 16) { c.etapa=17; c.processStart=Date.now(); reply=M.fechamento(n);
    } else if (etapa >= 17) {
      const dias=c.processStart?Math.floor((Date.now()-c.processStart)/(1000*60*60*24)):0;
      if      (dias>=25&&!c.upd25){c.upd25=true;reply=M.upd_d25(n);}
      else if (dias>=15&&!c.upd15){c.upd15=true;reply=M.upd_d15(n);}
      else if (dias>=7 &&!c.upd7) {c.upd7=true; reply=M.upd_d7(n);}
      else { reply=`Processo em andamento! ✅ Qualquer dúvida é só chamar, ${n}. 💪`; }
    }
  } else {
    reply = M.nao_entendi();
  }

  c.tentativas = 0;
  c.ultimaMsg  = agora;
  await salvar(id, c);
  console.log(`[${id}] E${etapa}→E${c.etapa} | "${reply.substring(0,60)}"`);
  return reply;
}

// ─────────────────────────────────────────────────────────────
//  WEBHOOK
// ─────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const id    = identificarContato(req.body);
    const msg   = (req.body.message || "").trim();
    const reply = await processar(id, msg);
    res.json({ reply: reply || "" });
  } catch(err) {
    console.error("❌", err.message);
    res.status(200).json({ reply: "Desculpe, tive um problema técnico. Pode repetir?" });
  }
});

// ─────────────────────────────────────────────────────────────
//  PIX
// ─────────────────────────────────────────────────────────────
app.get("/pix/:v", async (req,res) => {
  try { res.setHeader("Content-Type","text/html;charset=utf-8"); res.send(await paginaPix(parseFloat(req.params.v))); }
  catch(e) { res.status(500).send(e.message); }
});
