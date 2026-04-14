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

const ASAAS_KEY  = process.env.ASAAS_API_KEY || "";   // cole sua chave Asaas aqui
const ASAAS_URL  = "https://api.asaas.com/api/v3";    // produção
const BASE_URL   = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : process.env.BASE_URL || "https://whatauto-bot-production.up.railway.app";

const USE_ASAAS  = ASAAS_KEY.length > 10;             // usa Asaas se tiver chave

console.log(`✅ JustHelp Bot v10 | Asaas=${USE_ASAAS} | ${BASE_URL}`);

// ─────────────────────────────────────────────────────────────
//  PIX MANUAL (fallback sem Asaas)
// ─────────────────────────────────────────────────────────────
function pf(id,v){return `${id}${String(v.length).padStart(2,"0")}${v}`;}
function pcrc(s){let c=0xFFFF;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021):(c<<1);}return(c&0xFFFF).toString(16).toUpperCase().padStart(4,"0");}
function pixPayload(valor){
  const ma=pf("00","BR.GOV.BCB.PIX")+pf("01","justhelpadv@gmail.com");
  const p=pf("00","01")+pf("01","12")+pf("26",ma)+pf("52","0000")+pf("53","986")+pf("54",Number(valor).toFixed(2))+pf("58","BR")+pf("59","JustHelp Adv")+pf("60","Sao Paulo")+pf("62",pf("05","JUSTHELPADV"))+"6304";
  return p+pcrc(p);
}
async function paginaPix(valor,nome=""){
  const code=pixPayload(valor);
  const qr=await QRCode.toDataURL(code,{width:260,margin:2});
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagar R$ ${Number(valor).toFixed(2).replace(".",",")} — JustHelp</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}.card{background:#fff;border-radius:20px;padding:28px 22px;max-width:360px;width:100%;text-align:center}.logo{background:#1D7874;color:#fff;border-radius:10px;padding:8px 18px;display:inline-block;font-weight:700;font-size:17px;margin-bottom:14px}.valor{font-size:36px;font-weight:700;color:#1D7874}.sub{color:#888;font-size:13px;margin-bottom:18px}.qr{background:#f8f9fa;border-radius:14px;padding:14px;display:inline-block;margin-bottom:16px}.qr img{display:block;width:230px;height:230px}.steps{text-align:left;margin-bottom:14px}.step{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#444}.step:last-child{border:none}.n{background:#1D7874;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px}.copia{background:#f8f9fa;border-radius:10px;padding:10px;font-family:monospace;font-size:10px;color:#333;word-break:break-all;margin-bottom:10px;text-align:left;line-height:1.5}.btn{width:100%;padding:14px;border-radius:10px;border:none;font-size:15px;font-weight:700;cursor:pointer;background:#1D7874;color:#fff}.ok{background:#22c55e}.aviso{font-size:11px;color:#aaa;margin-top:12px}</style></head>
<body><div class="card"><div class="logo">JustHelp</div><div class="valor">R$ ${Number(valor).toFixed(2).replace(".",",")}</div><div class="sub">${valor==50?"Diagnóstico de CPF":"Entrada — Restauração de Crédito"}${nome?" · "+nome:""}</div><div class="qr"><img src="${qr}" alt="QR Pix"></div>
<div class="steps"><div class="step"><span class="n">1</span><span>Abra seu banco ou app de pagamentos</span></div><div class="step"><span class="n">2</span><span>Pix → <strong>QR Code</strong> ou <strong>Copia e Cola</strong></span></div><div class="step"><span class="n">3</span><span>Confirme e pague</span></div></div>
<div class="copia" id="cod">${code}</div><button class="btn" id="btn" onclick="copy()">📋 Copiar código Pix</button>
<div class="aviso">⚠️ Após pagar, volte ao WhatsApp e envie o comprovante.</div></div>
<script>function copy(){navigator.clipboard.writeText(document.getElementById('cod').textContent).then(()=>{const b=document.getElementById('btn');b.textContent='✅ Copiado!';b.classList.add('ok');setTimeout(()=>{b.textContent='📋 Copiar código Pix';b.classList.remove('ok')},3000)})}</script></body></html>`;
}

// ─────────────────────────────────────────────────────────────
//  ASAAS — gerar cobrança e link de pagamento
// ─────────────────────────────────────────────────────────────
async function criarCobrancaAsaas(nome, cpf, valor, telefone) {
  try {
    // 1. Buscar ou criar cliente
    const busca = await fetch(`${ASAAS_URL}/customers?cpfCnpj=${cpf.replace(/\D/g,"")}`, {
      headers: { "access_token": ASAAS_KEY }
    }).then(r=>r.json());

    let customerId;
    if (busca.data?.length > 0) {
      customerId = busca.data[0].id;
    } else {
      const novo = await fetch(`${ASAAS_URL}/customers`, {
        method: "POST",
        headers: { "Content-Type":"application/json", "access_token": ASAAS_KEY },
        body: JSON.stringify({ name: nome, cpfCnpj: cpf.replace(/\D/g,""), mobilePhone: telefone.replace(/\D/g,"") })
      }).then(r=>r.json());
      customerId = novo.id;
    }

    // 2. Criar cobrança Pix
    const cobranca = await fetch(`${ASAAS_URL}/payments`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "access_token": ASAAS_KEY },
      body: JSON.stringify({
        customer: customerId,
        billingType: "PIX",
        value: valor,
        dueDate: new Date(Date.now()+24*60*60*1000).toISOString().split("T")[0],
        description: valor==50 ? "Diagnóstico de CPF - JustHelp" : "Entrada Processo - JustHelp",
        externalReference: telefone
      })
    }).then(r=>r.json());

    // 3. Pegar QR Code Pix
    const qrData = await fetch(`${ASAAS_URL}/payments/${cobranca.id}/pixQrCode`, {
      headers: { "access_token": ASAAS_KEY }
    }).then(r=>r.json());

    return { id: cobranca.id, link: cobranca.invoiceUrl, payload: qrData.payload, success: true };
  } catch(e) {
    console.error("Asaas erro:", e.message);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────────────
//  ESTADO
// ─────────────────────────────────────────────────────────────
async function get(id)    { try{return(await redis.get(`c:${id}`))||novo();}catch{return novo();} }
async function save(id,c) { try{await redis.set(`c:${id}`,c);}catch(e){console.error("redis:",e.message);} }
function novo() { return { etapa:0, nome:"", cpf:"", dados:"", modoHumano:false, pagos:[], cobrancaId50:"", cobrancaId250:"" }; }

function getId(body) {
  const phone  = (body.phone  ||"").toString().trim();
  const sender = (body.sender ||"").toString().trim();
  if (phone  && phone  !=="WhatsAuto app" && /\d/.test(phone)) return phone;
  if (sender && sender !=="WhatsAuto app" && sender !=="") return sender;
  return `teste_${Date.now()}`;
}
function nomeF(t) {
  return t.trim().split(" ").map(p=>p.charAt(0).toUpperCase()+p.slice(1).toLowerCase()).join(" ");
}
function isOi(msg) {
  return /^(oi|ol[aá]|oii+|bom dia|boa tarde|boa noite|hello|hi|opa|salve|al[oô]|menu|inicio|start|começar)[\s!?.]*$/i.test(msg.trim());
}

// ─────────────────────────────────────────────────────────────
//  MENSAGENS — humanizadas e objetivas
// ─────────────────────────────────────────────────────────────
const M = {

  // ── FASE 1: Abertura ────────────────────────────────────────
  inicio: ()=>
    `Olá! 👋 Seja bem-vindo à *JustHelp Assessoria Jurídica*.\n\nAntes de tudo, me fala seu *nome* pra eu te atender do jeito certo. 😊`,

  menu: (n)=>
    `Prazer, *${n}*! 😊\n\nComo posso te ajudar?\n\n1️⃣ Quero limpar meu nome\n2️⃣ Entender como funciona`,

  menu_retorno: (n)=>
    `Certo, *${n}*! 😊 Por onde quer continuar?\n\n1️⃣ Quero fazer o diagnóstico do meu CPF\n2️⃣ Entender melhor como funciona\n3️⃣ Tirar uma dúvida específica`,

  como_funciona: ()=>
    `Boa pergunta! 💡\n\nMuita gente confunde nosso trabalho com renegociação — mas são coisas completamente diferentes.\n\nNós fazemos uma *análise jurídica* das suas dívidas. Identificamos irregularidades como:\n\n• Juros acima do permitido por lei\n• Dívidas com prazo de prescrição vencido\n• Cobranças indevidas ou duplicadas\n\nCom isso, entramos juridicamente pedindo a *remoção dos apontamentos* dos órgãos de restrição (Serasa, SPC e outros). Você volta a ter crédito no mercado! ⚖️\n\n*Bônus:* após a remoção, trabalhamos também no *aumento do seu score*. 📈\n\n1️⃣ Quero fazer um diagnóstico do meu CPF\n2️⃣ Voltar ao menu`,

  onde: ()=>
    `Entendido! Me conta: *onde estão suas restrições?*\n\n1️⃣ Serasa\n2️⃣ SPC\n3️⃣ Banco específico\n4️⃣ Cartório\n5️⃣ Não sei ao certo`,

  tempo: ()=>
    `Certo! Há quanto tempo você está com restrições?\n\n1️⃣ Menos de 1 ano\n2️⃣ Entre 1 e 3 anos\n3️⃣ Mais de 3 anos`,

  tentou: ()=>
    `Você já tentou resolver antes?\n\n1️⃣ Sim, tentei renegociar ou parcelar\n2️⃣ Não, é minha primeira vez buscando ajuda`,

  resp_tentou_sim: (n)=>
    `Entendo, ${n}. E saiba que não é culpa sua — renegociação *não resolve*, porque a dívida continua existindo.\n\nNosso trabalho é diferente: encontramos os *erros jurídicos* na dívida e pedimos a remoção. Muita gente que veio frustrada de outras tentativas conseguiu resultado conosco. 💪`,

  resp_tentou_nao: (n)=>
    `Boa notícia, ${n}: você está no lugar certo desde o início! Vamos dar um passo seguro e inteligente. 😊`,

  // ── FASE 2: Posicionamento e oferta diagnóstico ─────────────
  posicionamento: (n)=>
    `${n}, deixa eu ser direto com você. ⚖️\n\nHoje, com o nome sujo, você perde:\n• Acesso a crédito e financiamentos\n• Cartão de crédito\n• Oportunidades de trabalho que pedem CPF limpo\n\nIsso tem um custo invisível que é *muito maior* que qualquer dívida.\n\nNosso processo jurídico age na *remoção dos apontamentos* dos órgãos de restrição — removemos seu nome do Serasa, SPC e demais cadastros negativos. O primeiro passo é um *diagnóstico completo do seu CPF*.\n\nEsse diagnóstico custa *R$ 50* — e se você seguir com o processo, esse valor já vem *abatido*. É literalmente um investimento que se paga. 💡\n\nO que acha?\n\n1️⃣ Quero fazer o diagnóstico agora\n2️⃣ Tenho dúvidas sobre o valor\n3️⃣ Não sei se é confiável\n4️⃣ Já tentei antes e não funcionou\n5️⃣ Preciso entender melhor como funciona\n6️⃣ Preciso pensar um pouco`,

  obj_valor: ()=>
    `Entendo a dúvida! Mas pensa comigo: 🤔\n\n💡 R$ 50 é menos que uma consulta médica\n💡 Se não houver viabilidade no seu caso, você *saberá antes* de gastar mais\n💡 Se seguir com o processo, esse R$ 50 já vem *abatido* do valor final\n\nNão é um gasto — é um investimento inteligente antes de dar um passo maior.\n\n1️⃣ Faz sentido, quero fazer o diagnóstico\n2️⃣ Mesmo assim não tenho o valor agora`,

  obj_sem_dinheiro_50: ()=>
    `Tudo bem! R$ 50 parece pouco, mas se não tiver no momento, sem pressão. 😊\n\nQuando você conseguir separar esse valor, é só mandar um *Oi* aqui que a gente retoma.\n\n1️⃣ Na verdade consigo sim — quero fazer agora\n2️⃣ Vou guardar e volto em breve`,

  obj_confiavel: ()=>
    `Sua desconfiança é *totalmente válida* — tem muita fraude por aí, infelizmente. 🙏\n\nPor isso o diagnóstico de R$ 50 existe: é justamente para você *ver a viabilidade do seu caso antes* de investir mais.\n\nSe não houver caminho jurídico, você saberá e não gasta mais nada. Somos um escritório registrado e só atuamos em casos onde realmente podemos ajudar.\n\n1️⃣ Faz sentido, vou fazer o diagnóstico\n2️⃣ Quero saber mais antes de decidir`,

  obj_ja_tentou: (n)=>
    `${n}, o que você tentou antes foi *renegociação ou parcelamento*, certo?\n\nEsse modelo não funciona porque a dívida continua existindo — você só adia o problema.\n\nNosso modelo é *jurídico*: a gente analisa se a dívida tem erros legais. E muitas têm! Juros ilegais, prazo vencido, cobranças indevidas. Quando encontramos isso, pedimos juridicamente a *remoção*.\n\nÉ completamente diferente do que você já tentou. 💪\n\n1️⃣ Entendi, quero tentar esse caminho\n2️⃣ Ainda tenho dúvidas`,

  obj_entender: ()=>
    `Claro! Vou explicar em 3 passos simples: 📋\n\n*1.* Fazemos o diagnóstico do seu CPF (R$ 50) — identificamos todas as restrições e se têm irregularidades\n*2.* Se houver viabilidade, abrimos o processo jurídico (entrada de R$ 250)\n*3.* Nossa equipe age juridicamente para *remover os apontamentos* dos órgãos de restrição — você paga os R$ 450 de êxito *somente quando o nome estiver limpo*
*Bônus:* trabalhamos também no aumento do seu score! 📈\n\nRisco mínimo para você. O nosso é maior — só ganhamos se você ganhar. ⚖️\n\n1️⃣ Entendi! Quero começar com o diagnóstico\n2️⃣ Ainda tenho dúvida`,

  obj_pensar_50: ()=>
    `Claro, sem pressão! 😊\n\nMas antes de pensar, deixa eu te fazer uma pergunta: *o que exatamente está te travando?*\n\n1️⃣ Questão financeira no momento\n2️⃣ Não confio totalmente ainda\n3️⃣ Quero consultar alguém antes\n4️⃣ Vou pensar e retorno depois`,

  coletar_dados: ()=>
    `Ótimo, vamos lá! 🎉\n\nPara preparar seu diagnóstico, preciso de algumas informações.\n\nMe envia seu *nome completo* e *CPF* aqui. 📋`,

  // ── FASE 3: Pagamento R$50 ───────────────────────────────────
  enviar_pix50_manual: (url)=>
    `Perfeito! Preparei tudo pra você. 🖥️\n\n*Valor:* R$ 50\n\n👇 *Clique aqui para pagar (QR Code + Copia e Cola):*\n${url}\n\nAssim que confirmar o pagamento, é só me enviar qualquer mensagem ou o comprovante aqui. 📸`,

  enviar_pix50_asaas: (link)=>
    `Perfeito! Preparei sua cobrança. 🖥️\n\n*Valor:* R$ 50\n\n👇 *Clique aqui para pagar:*\n${link}\n\nO sistema confirma o pagamento automaticamente assim que cair. 😊`,

  aguardando_pix50: ()=>
    `Aguardando confirmação do seu pagamento... ⏳\n\nSe já pagou, é só me enviar o comprovante aqui que eu confirmo na hora! 📸`,

  // ── DIAGNÓSTICO AUTOMÁTICO ───────────────────────────────────
  analisando_1: (n)=>
    `✅ Pagamento confirmado! Obrigado, ${n}!\n\nJá iniciei a análise do seu CPF. Aguarda um momento... 🔍`,

  analisando_2: ()=>
    `🔎 *Verificando Serasa...*\n_consultando base de dados..._`,

  analisando_3: ()=>
    `🔎 *Verificando SPC e bancos associados...*\n_analisando histórico de restrições..._`,

  analisando_4: ()=>
    `🔎 *Verificando data de origem e irregularidades...*\n_identificando possibilidades jurídicas..._`,

  diagnostico: (n)=>
    `📊 *DIAGNÓSTICO CONCLUÍDO — ${n.toUpperCase()}*\n\n*Restrições identificadas:* ✅ Encontradas\n*Tempo de negativação:* Dentro do prazo de atuação\n*Irregularidades detectadas:* ✅ Identificadas\n*Viabilidade jurídica:* ✅ *FAVORÁVEL*\n\n${n}, o cenário para a restauração do seu crédito é *positivo*. Identificamos pontos que permitem atuação jurídica para remoção das restrições.\n\nQuer que eu explique como funciona o processo completo?\n\n1️⃣ Sim, quero saber o próximo passo\n2️⃣ Tenho dúvidas sobre o resultado`,

  obj_duvida_diagnostico: (n)=>
    `${n}, entendo! Deixa eu ser mais claro. 😊\n\nO diagnóstico identificou que suas restrições possuem características que permitem atuação jurídica — isso inclui análise de prazo, origem da dívida e conformidade legal das cobranças.\n\nNão garantimos 100% de remoção em todos os itens (trabalhamos com honestidade), mas o cenário é *favorável* para uma parte significativa das suas restrições.\n\n1️⃣ Entendi, quero avançar com o processo\n2️⃣ Ainda tenho dúvidas`,

  // ── FASE 4: Oferta processo completo ────────────────────────
  oferta_processo: (n)=>
    `${n}, para darmos entrada e buscarmos a *liberação do seu nome*: ⚖️\n\n▶ *Entrada:* R$ 250\n▶ *Êxito:* R$ 450 _(pago SOMENTE após resultado comprovado)_\n▶ *Bônus:* Os R$ 50 do diagnóstico já estão abatidos!\n▶ *Prazo:* até *30 dias úteis*\n▶ *Bônus:* aumento de score incluído! 📈\n▶ *Contrato:* sim, você recebe um contrato formal\n\n⚠️ Se não funcionar, você *não paga* os R$ 450. Só ganhamos se você ganhar.\n\n1️⃣ Quero entrar no processo agora\n2️⃣ O valor está alto para mim\n3️⃣ E se não funcionar?\n4️⃣ Quanto tempo demora?\n5️⃣ Como funciona o contrato?\n6️⃣ Preciso pensar um pouco`,

  obj_caro: (n)=>
    `${n}, entendo. Mas deixa eu colocar na balança: 💰\n\nCom o nome limpo você volta a ter:\n✅ Cartão de crédito\n✅ Financiamentos\n✅ Crédito no comércio\n✅ Oportunidades de trabalho\n\nIsso representa *muito mais* que R$ 250 por mês. E os R$ 450 de êxito só pagam *depois que seu nome já estiver limpo*.\n\n1️⃣ Faz sentido, quero entrar\n2️⃣ Realmente não tenho o valor agora`,

  obj_sem_dinheiro_250: ()=>
    `Tudo bem! Quando estiver pronto, é só mandar um *Oi* que retomamos de onde paramos. 😊\n\nSeu diagnóstico fica salvo aqui.\n\n1️⃣ Na verdade consigo sim — quero entrar\n2️⃣ Vou organizar e volto em breve`,

  obj_falhar: ()=>
    `Ótima pergunta — e a resposta vai te tranquilizar! 😊\n\nOs R$ 450 de êxito são cobrados *SOMENTE após o resultado aparecer*. Se não funcionar, você *não paga esse valor*.\n\nPense assim:\n• Você arrisca: R$ 250 de entrada\n• Nós arriscamos: todo o trabalho jurídico\n• Só cobramos o êxito quando você ganhar\n\nNosso risco é maior que o seu. 💪\n\n1️⃣ Entendi, quero entrar no processo\n2️⃣ Ainda tenho dúvida`,

  obj_tempo: ()=>
    `*Prazo de até 30 dias úteis.* ⏱️\n\nA maioria dos casos tem resultado antes disso. Casos mais simples, em menos de 15 dias.\n\nAssim que você entrar, o processo começa *no mesmo dia*. ⚡\n\n1️⃣ Ótimo, quero começar agora\n2️⃣ Preciso pensar mais`,

  obj_contrato: ()=>
    `Boa pergunta! Trabalhamos com *total transparência*. 📄\n\nDepois do pagamento da entrada, você vai:\n\n1️⃣ Enviar uma foto do seu RG (frente e verso)\n2️⃣ Enviar uma foto do seu CPF\n\nCom esses dados, preparamos um *contrato formal* com todos os termos, prazos e garantias. O contrato é seu comprovante de que estamos trabalhando pelo seu caso.\n\n1️⃣ Entendi, quero assinar o contrato\n2️⃣ Tenho mais dúvidas`,

  obj_pensar_250: (n)=>
    `${n}, sem pressão! Mas me conta: o que está te travando?\n\n1️⃣ Questão financeira no momento\n2️⃣ Ainda tenho dúvida sobre o processo\n3️⃣ Quero consultar alguém antes\n4️⃣ Vou pensar e retorno depois`,

  // ── FASE 5: Pagamento R$250 ──────────────────────────────────
  enviar_pix250_manual: (url)=>
    `Ótima decisão, vamos lá! 🎉\n\n*Entrada: R$ 250*\n\n👇 *Clique aqui para pagar (QR Code + Copia e Cola):*\n${url}\n\nAssim que confirmar, me envia o comprovante aqui. 📸`,

  enviar_pix250_asaas: (link)=>
    `Ótima decisão, vamos lá! 🎉\n\n*Entrada: R$ 250*\n\n👇 *Clique aqui para pagar:*\n${link}\n\nO sistema confirma automaticamente. 😊`,

  aguardando_pix250: ()=>
    `Aguardando confirmação do seu pagamento... ⏳\n\nSe já pagou, é só me enviar o comprovante aqui! 📸`,

  // ── FASE 5: Documentos para contrato ────────────────────────
  pedir_rg: (n)=>
    `*Entrada confirmada!* ✅ Obrigado, ${n}!\n\nAgora vamos formalizar seu *contrato*. 📄\n\nPreciso de uma foto do seu *RG — frente e verso* (pode ser uma única foto mostrando os dois lados).\n\n📸 _Envie a foto aqui agora._`,

  pedir_cpf: ()=>
    `Perfeito! ✅\n\nAgora me envia uma foto do seu *CPF*. 📸`,

  docs_recebidos: (n)=>
    `Documentação recebida! ✅\n\nTudo certo, ${n}. Estamos preparando seu contrato com base nas informações coletadas.`,

  // ── FASE 6: Fechamento ───────────────────────────────────────
  fechamento: (n)=>
    `🎉 *${n}, seu processo foi OFICIALMENTE ABERTO!*\n\nAqui está o resumo do que acontece agora:\n\n⚖️ Nossa equipe jurídica já está trabalhando na *remoção dos seus apontamentos*\n📅 Prazo de até *30 dias úteis* para resultado\n📈 *Bônus:* aumento de score incluso\n📄 Contrato será enviado em breve\n💰 Os R$ 450 de êxito só serão cobrados *após* o resultado\n\nVocê tomou a decisão certa hoje. Nome limpo está mais perto do que você imagina! 💪\n\nQualquer dúvida ao longo do processo, é só mandar mensagem aqui. Estamos com você! 😊`,

  humano: ()=>
    `👋 Conectando com um especialista agora...`,

  nao_entendi: ()=>
    `Responde com o *número* da opção. 😊`,
};

// ─────────────────────────────────────────────────────────────
//  ENVIO DE PIX (Asaas ou manual)
// ─────────────────────────────────────────────────────────────
async function enviarPix(valor, contato, id, res) {
  if (USE_ASAAS) {
    const cobranca = await criarCobrancaAsaas(contato.nome, contato.cpf, valor, id);
    if (cobranca.success) {
      if (valor === 50)  contato.cobrancaId50  = cobranca.id;
      if (valor === 250) contato.cobrancaId250 = cobranca.id;
      return { reply: valor===50 ? M.enviar_pix50_asaas(cobranca.link) : M.enviar_pix250_asaas(cobranca.link) };
    }
  }
  // fallback manual
  const url = `${BASE_URL}/pix/${valor}`;
  return { reply: valor===50 ? M.enviar_pix50_manual(url) : M.enviar_pix250_manual(url) };
}

// ─────────────────────────────────────────────────────────────
//  WEBHOOK PRINCIPAL
// ─────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  console.log("━━━━ MSG ━━━━", JSON.stringify(req.body).substring(0,150));
  try {
    const id     = getId(req.body);
    const rawMsg = (req.body.message || "").trim();
    const num    = rawMsg.replace(/[^0-9]/g,"");
    const c      = await get(id);
    let { etapa, nome: n, modoHumano } = c;

    if (modoHumano) return res.json({ reply:"" });

    // Pedido de humano a qualquer momento
    if (/humano|atendente|falar com (algu[eé]m|pessoa)|quero humano/i.test(rawMsg)) {
      c.modoHumano=true; await save(id,c);
      return res.json({ reply: M.humano() });
    }

    // Reinício — qualquer msg nova quando fluxo acabou, ou saudação
    if (etapa===0 || etapa>=17 || isOi(rawMsg)) {
      Object.assign(c,{etapa:1,nome:"",cpf:"",dados:"",cobrancaId50:"",cobrancaId250:"",pagos:[],modoHumano:false});
      await save(id,c);
      return res.json({ reply: M.inicio() });
    }

    let reply="";

    // ── E1: captura nome ──────────────────────────────────────
    if (etapa===1) {
      c.nome=nomeF(rawMsg); n=c.nome; c.etapa=2;
      reply=M.menu(n);

    // ── E2: menu principal ────────────────────────────────────
    } else if (etapa===2) {
      if      (num==="1") { c.etapa=3; reply=M.onde(); }
      else if (num==="2") { c.etapa=20; reply=M.como_funciona(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.menu(n); }

    // ── E20: como funciona ────────────────────────────────────
    } else if (etapa===20) {
      if      (num==="1") { c.etapa=3; reply=M.onde(); }
      else if (num==="2") { c.etapa=21; reply=M.menu_retorno(n); }
      else                { reply=M.nao_entendi()+"\n\n"+M.como_funciona(); }

    // ── E21: menu retorno (nome já salvo) ────────────────────
    } else if (etapa===21) {
      if      (num==="1") { c.etapa=3; reply=M.onde(); }
      else if (num==="2") { c.etapa=20; reply=M.como_funciona(); }
      else if (num==="3") { c.etapa=22; reply=`Claro, ${n}! Qual é a sua dúvida? Pode falar à vontade. 😊`; }
      else                { reply=M.nao_entendi()+"\n\n"+M.menu_retorno(n); }

    // ── E22: dúvida livre ─────────────────────────────────────
    } else if (etapa===22) {
      c.etapa=21;
      reply=`Entendido! 😊 Se quiser avançar:\n\n`+M.menu_retorno(n);

    // ── E3: onde restrições ───────────────────────────────────
    } else if (etapa===3) {
      if (["1","2","3","4","5"].includes(num)) {
        const loc={1:"Serasa",2:"SPC",3:"banco",4:"cartório",5:"local não identificado"};
        c.dados=`Restrição: ${loc[num]}`; c.etapa=4; reply=M.tempo();
      } else { reply=M.nao_entendi()+"\n\n"+M.onde(); }

    // ── E4: há quanto tempo ───────────────────────────────────
    } else if (etapa===4) {
      if (["1","2","3"].includes(num)) {
        c.etapa=5; reply=M.tentou();
      } else { reply=M.nao_entendi()+"\n\n"+M.tempo(); }

    // ── E5: já tentou ─────────────────────────────────────────
    } else if (etapa===5) {
      if (num==="1") { c.etapa=6; reply=M.resp_tentou_sim(n)+"\n\n"+M.posicionamento(n); }
      else if (num==="2") { c.etapa=6; reply=M.resp_tentou_nao(n)+"\n\n"+M.posicionamento(n); }
      else { reply=M.nao_entendi()+"\n\n"+M.tentou(); }

    // ── E6: posicionamento + oferta R$50 ──────────────────────
    } else if (etapa===6) {
      if      (num==="1") { c.etapa=7; reply=M.coletar_dados(); }
      else if (num==="2") { c.etapa=61; reply=M.obj_valor(); }
      else if (num==="3") { c.etapa=62; reply=M.obj_confiavel(); }
      else if (num==="4") { c.etapa=63; reply=M.obj_ja_tentou(n); }
      else if (num==="5") { c.etapa=64; reply=M.obj_entender(); }
      else if (num==="6") { c.etapa=65; reply=M.obj_pensar_50(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.posicionamento(n); }

    // ── Objeções R$50 ─────────────────────────────────────────
    } else if (etapa===61) { // obj valor
      if      (num==="1") { c.etapa=7; reply=M.coletar_dados(); }
      else if (num==="2") { c.etapa=611; reply=M.obj_sem_dinheiro_50(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.obj_valor(); }

    } else if (etapa===611) { // sem dinheiro R$50
      if      (num==="1") { c.etapa=7; reply=M.coletar_dados(); }
      else if (num==="2") { reply=`Sem problema! Quando estiver pronto, manda um *Oi* aqui. 😊`; c.etapa=0; }
      else                { reply=M.nao_entendi()+"\n\n"+M.obj_sem_dinheiro_50(); }

    } else if (etapa===62) { // não confio
      if      (num==="1") { c.etapa=7; reply=M.coletar_dados(); }
      else if (num==="2") { c.etapa=64; reply=M.obj_entender(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.obj_confiavel(); }

    } else if (etapa===63) { // já tentei
      if      (num==="1") { c.etapa=7; reply=M.coletar_dados(); }
      else if (num==="2") { c.etapa=64; reply=M.obj_entender(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.obj_ja_tentou(n); }

    } else if (etapa===64) { // entender melhor
      if      (num==="1") { c.etapa=7; reply=M.coletar_dados(); }
      else if (num==="2") { c.etapa=62; reply=M.obj_confiavel(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.obj_entender(); }

    } else if (etapa===65) { // preciso pensar R$50
      if      (num==="1") { c.etapa=611; reply=M.obj_sem_dinheiro_50(); }
      else if (num==="2") { c.etapa=62; reply=M.obj_confiavel(); }
      else if (num==="3") { c.etapa=64; reply=M.obj_entender(); }
      else if (num==="4") { reply=`Sem problema! Manda um *Oi* quando quiser retomar. 😊`; c.etapa=0; }
      else                { reply=M.nao_entendi()+"\n\n"+M.obj_pensar_50(); }

    // ── E7: coleta dados CPF ──────────────────────────────────
    } else if (etapa===7) {
      // extrai CPF se vier junto com o nome
      const cpfMatch = rawMsg.match(/\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?\d{2}/);
      if (cpfMatch) c.cpf = cpfMatch[0];
      c.dados += ` | Dados: ${rawMsg}`;
      c.etapa = 8;
      const pixResp = await enviarPix(50, c, id, res);
      reply = pixResp.reply;

    // ── E8: aguarda comprovante / confirmação R$50 ────────────
    } else if (etapa===8) {
      // qualquer envio = comprovante (imagem chega como msg vazia)
      c.etapa=9;
      reply=M.analisando_1(n);
      // agenda mensagens de suspense (simuladas via etapas)
      await save(id,c);
      // envia resposta imediata e agenda diagnóstico
      setTimeout(async()=>{
        const cc=await get(id);
        if(cc.etapa===9){
          cc.etapa=10;
          await save(id,cc);
        }
      },2000);
      return res.json({reply});

    // ── E9/10: simulação de análise ───────────────────────────
    } else if (etapa===9||etapa===10) {
      c.etapa=11;
      reply=M.diagnostico(n);

    // ── E11: resultado diagnóstico ────────────────────────────
    } else if (etapa===11) {
      if      (num==="1") { c.etapa=12; reply=M.oferta_processo(n); }
      else if (num==="2") { c.etapa=111; reply=M.obj_duvida_diagnostico(n); }
      else                { reply=M.nao_entendi()+"\n\n"+M.diagnostico(n); }

    } else if (etapa===111) { // dúvida diagnóstico
      if      (num==="1") { c.etapa=12; reply=M.oferta_processo(n); }
      else if (num==="2") { reply=`Pode me contar qual a dúvida específica? Estou aqui para explicar! 😊`; }
      else                { reply=M.nao_entendi()+"\n\n"+M.obj_duvida_diagnostico(n); }

    // ── E12: oferta processo completo ─────────────────────────
    } else if (etapa===12) {
      if      (num==="1") { c.etapa=13;  const p=await enviarPix(250,c,id,res); reply=p.reply; }
      else if (num==="2") { c.etapa=121; reply=M.obj_caro(n); }
      else if (num==="3") { c.etapa=122; reply=M.obj_falhar(); }
      else if (num==="4") { c.etapa=123; reply=M.obj_tempo(); }
      else if (num==="5") { c.etapa=124; reply=M.obj_contrato(); }
      else if (num==="6") { c.etapa=125; reply=M.obj_pensar_250(n); }
      else                { reply=M.nao_entendi()+"\n\n"+M.oferta_processo(n); }

    // ── Objeções R$250 ────────────────────────────────────────
    } else if (etapa===121) { // caro
      if      (num==="1") { c.etapa=13; const p=await enviarPix(250,c,id,res); reply=p.reply; }
      else if (num==="2") { c.etapa=1211; reply=M.obj_sem_dinheiro_250(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.obj_caro(n); }

    } else if (etapa===1211) { // sem dinheiro R$250
      if      (num==="1") { c.etapa=13; const p=await enviarPix(250,c,id,res); reply=p.reply; }
      else if (num==="2") { reply=`Sem problema! Manda *Oi* quando estiver pronto. 😊`; c.etapa=0; }
      else                { reply=M.nao_entendi()+"\n\n"+M.obj_sem_dinheiro_250(); }

    } else if (etapa===122) { // e se falhar
      if      (num==="1") { c.etapa=13; const p=await enviarPix(250,c,id,res); reply=p.reply; }
      else if (num==="2") { c.etapa=12; reply=M.oferta_processo(n); }
      else                { reply=M.nao_entendi()+"\n\n"+M.obj_falhar(); }

    } else if (etapa===123) { // tempo
      if      (num==="1") { c.etapa=13; const p=await enviarPix(250,c,id,res); reply=p.reply; }
      else if (num==="2") { c.etapa=12; reply=M.oferta_processo(n); }
      else                { reply=M.nao_entendi()+"\n\n"+M.obj_tempo(); }

    } else if (etapa===124) { // contrato
      if      (num==="1") { c.etapa=13; const p=await enviarPix(250,c,id,res); reply=p.reply; }
      else if (num==="2") { c.etapa=12; reply=M.oferta_processo(n); }
      else                { reply=M.nao_entendi()+"\n\n"+M.obj_contrato(); }

    } else if (etapa===125) { // preciso pensar R$250
      if      (num==="1") { c.etapa=1211; reply=M.obj_sem_dinheiro_250(); }
      else if (num==="2") { c.etapa=122; reply=M.obj_falhar(); }
      else if (num==="3") { c.modoHumano=true; reply=M.humano(); }
      else if (num==="4") { reply=`Sem problema! Manda um *Oi* quando quiser. 😊`; c.etapa=0; }
      else                { reply=M.nao_entendi()+"\n\n"+M.obj_pensar_250(n); }

    // ── E13: aguarda comprovante R$250 ────────────────────────
    } else if (etapa===13) {
      c.etapa=14;
      reply=M.pedir_rg(n);

    // ── E14: aguarda foto RG ──────────────────────────────────
    } else if (etapa===14) {
      c.etapa=15;
      reply=M.pedir_cpf();

    // ── E15: aguarda foto CPF ─────────────────────────────────
    } else if (etapa===15) {
      c.etapa=16;
      reply=M.docs_recebidos(n);

    // ── E16: fechamento ───────────────────────────────────────
    } else if (etapa===16) {
      c.etapa=17;
      reply=M.fechamento(n);

    } else if (etapa===17) {
      reply=`Processo em andamento! ✅ Qualquer dúvida é só chamar, ${n}. Estamos com você! 💪`;

    } else {
      reply=`Olá, ${n||""}! 😊 Manda um *Oi* para acessar o menu.`;
    }

    await save(id,c);
    console.log(`[${id}] E${etapa}→E${c.etapa} reply="${reply.substring(0,60)}"`);
    res.json({reply});

  } catch(err) {
    console.error("❌",err.message);
    res.status(200).json({reply:"Desculpe, tive um problema técnico. Pode repetir?"});
  }
});

// ─────────────────────────────────────────────────────────────
//  WEBHOOK ASAAS — confirmação automática de pagamento
// ─────────────────────────────────────────────────────────────
app.post("/asaas-webhook", async (req,res) => {
  try {
    const { event, payment } = req.body;
    console.log("Asaas evento:", event, payment?.id);
    if (event !== "PAYMENT_RECEIVED" && event !== "PAYMENT_CONFIRMED") return res.json({ok:true});

    const telefone = payment?.externalReference;
    if (!telefone) return res.json({ok:true});

    const c = await get(telefone);
    if (!c) return res.json({ok:true});

    // Determina qual pagamento foi confirmado
    if (payment.id === c.cobrancaId50 && c.etapa===8) {
      c.etapa=9;
      await save(telefone,c);
      console.log(`✅ Pix R$50 confirmado para ${telefone}`);
    } else if (payment.id === c.cobrancaId250 && c.etapa===13) {
      c.etapa=14;
      await save(telefone,c);
      console.log(`✅ Pix R$250 confirmado para ${telefone}`);
    }

    res.json({ok:true});
  } catch(e) {
    console.error("Asaas webhook erro:",e.message);
    res.json({ok:true});
  }
});

// ─────────────────────────────────────────────────────────────
//  PIX PAGE
// ─────────────────────────────────────────────────────────────
app.get("/pix/:valor", async (req,res) => {
  try {
    const v=parseFloat(req.params.valor);
    if(isNaN(v)||v<=0) return res.status(400).send("Valor inválido");
    res.setHeader("Content-Type","text/html;charset=utf-8");
    res.send(await paginaPix(v));
  } catch(e){res.status(500).send("Erro:"+e.message);}
});

// ─────────────────────────────────────────────────────────────
//  DEBUG + ADMIN
// ─────────────────────────────────────────────────────────────
app.get("/debug", async (req,res) => {
  const rok=await redis.ping().then(()=>true).catch(()=>false);
  res.json({status:"ok",redis:rok,asaas:USE_ASAAS,baseUrl:BASE_URL,node:process.version});
});
app.post("/assumir", async (req,res) => {const c=await get(req.body.telefone);c.modoHumano=true; await save(req.body.telefone,c);res.json({ok:true});});
app.post("/liberar", async (req,res) => {const c=await get(req.body.telefone);c.modoHumano=false;await save(req.body.telefone,c);res.json({ok:true});});
app.post("/resetar", async (req,res) => {await redis.del(`c:${req.body.telefone}`);res.json({ok:true});});
app.get("/contatos", async (req,res) => {
  const keys=await redis.keys("c:*");
  if(!keys.length) return res.json([]);
  const vals=await Promise.all(keys.map(k=>redis.get(k)));
  res.json(keys.map((k,i)=>({id:k.replace("c:",""),...vals[i]})).filter(c=>!c.id.startsWith("teste_")));
});
app.get("/",(_, res)=>res.send("🤖 JustHelp Bot v10 — Online ✅"));

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`✅ JustHelp Bot v10 | porta ${PORT}`));
