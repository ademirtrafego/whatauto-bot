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
    `Certo, *${n}*! 😊 Por onde quer continuar?\n\n1️⃣ Quero fazer o diagnóstico do meu CPF\n2️⃣ Entender melhor como funciona\n3️⃣ Tenho dúvidas antes de decidir`,

  // ── MENUS DE DÚVIDAS ─────────────────────────────────────────
  menu_categorias: ()=>
    `Pode tirar todas as dúvidas! 😊 Escolha a categoria:\n\n1️⃣ Sobre o serviço\n2️⃣ Sobre confiança e segurança\n3️⃣ Sobre valores e prazo\n4️⃣ Sobre contrato e garantias\n5️⃣ Sobre o resultado\n6️⃣ Sobre o diagnóstico de R$ 50\n\n7️⃣ Já tirei minhas dúvidas — quero começar!`,

  // Categoria 1 — Serviço
  cat1: ()=>
    `*Sobre o serviço:* ⚖️\n\n1️⃣ O que exatamente vocês fazem?\n2️⃣ Preciso pagar a dívida?\n3️⃣ Funciona pra qualquer tipo de dívida?\n4️⃣ E se eu tiver muitas dívidas?\n5️⃣ Funciona pra dívida antiga ou recente?\n\n0️⃣ Voltar às categorias`,

  r1_1: ()=> `*O que fazemos:* ⚖️\n\nAnalisamos juridicamente suas dívidas em busca de irregularidades — juros abusivos, prescrição vencida, cobranças indevidas. Quando encontramos, entramos com pedido jurídico para *remover os apontamentos* do Serasa, SPC e demais órgãos de restrição.\n\nResultado: seu nome limpo e crédito disponível novamente. 🎯`,
  r1_2: ()=> `*Não precisa pagar a dívida.* 🙅\n\nNosso trabalho remove os *apontamentos* — não a dívida em si. A restrição sai do Serasa/SPC e você volta a ter crédito no mercado.\n\nA dívida pode continuar existindo juridicamente, mas sem te impedir de ter crédito. ✅`,
  r1_3: ()=> `Trabalhamos com a maioria dos tipos: *cartão de crédito, bancos, financeiras, lojas, operadoras de telefone* e outros.\n\nO diagnóstico de R$ 50 serve exatamente para identificar quais dívidas têm viabilidade jurídica no seu caso específico. 🔍`,
  r1_4: ()=> `Quanto mais restrições, *maior o potencial de atuação*! 💪\n\nAnalisamos todas as dívidas do seu CPF no diagnóstico e identificamos em quais podemos agir. Você receberá um panorama completo antes de qualquer decisão.`,
  r1_5: ()=> `Funciona para os dois casos! ✅\n\n• *Dívidas antigas:* maior chance de prescrição ou irregularidades acumuladas\n• *Dívidas recentes:* verificamos cobranças indevidas e juros abusivos\n\nO diagnóstico revela o cenário exato do seu caso.`,

  // Categoria 2 — Confiança
  cat2: ()=>
    `*Sobre confiança e segurança:* 🔒\n\n1️⃣ Como sei que não é golpe?\n2️⃣ Vocês são um escritório registrado?\n3️⃣ Já atenderam outros clientes?\n4️⃣ Por que cobram só R$ 50 no início?\n5️⃣ Meus dados ficam seguros?\n\n0️⃣ Voltar às categorias`,

  r2_1: ()=> `Entendo completamente — tem muita fraude por aí. 🙏\n\nAlguns sinais de que somos sérios:\n\n✅ Cobramos R$ 50 primeiro (não R$ 500 de cara)\n✅ O processo completo só paga após resultado\n✅ Emitimos contrato formal com CNPJ\n✅ Você pode verificar nosso registro antes de qualquer pagamento\n\nFraude pede valor alto na hora. Nós pedimos R$ 50 para provar viabilidade primeiro.`,
  r2_2: ()=> `Sim! Somos um *escritório jurídico devidamente registrado*. 📋\n\nAtuamos com assessoria jurídica especializada em direito do consumidor e proteção de crédito. Nosso trabalho é baseado em lei — especificamente no Código de Defesa do Consumidor e na legislação de proteção de dados.`,
  r2_3: ()=> `Sim, atendemos *centenas de clientes* com sucesso. 🎉\n\nMuitos chegaram frustrados após tentativas de renegociação e conseguiram resultado com nosso método jurídico.\n\nO processo funciona porque age na *causa jurídica* do problema, não apenas na negociação.`,
  r2_4: ()=> `Exatamente por isso: *transparência*. 💡\n\nO R$ 50 cobre o custo real de análise do seu CPF. Não faz sentido cobrar R$ 250 de entrada sem antes verificar se há viabilidade no seu caso.\n\nSe não houver caminho jurídico, você saberá por apenas R$ 50 — e não perde mais nada.`,
  r2_5: ()=> `*Seus dados ficam totalmente seguros.* 🔐\n\nUsamos as informações apenas para análise jurídica e elaboração do contrato. Não compartilhamos com terceiros. Seguimos a *LGPD* (Lei Geral de Proteção de Dados).\n\nRG, CPF e dados pessoais ficam protegidos em nosso sistema.`,

  // Categoria 3 — Valores e prazo
  cat3: ()=>
    `*Sobre valores e prazo:* 💰\n\n1️⃣ Quanto custa no total?\n2️⃣ Quanto tempo demora?\n3️⃣ Quando começa após o pagamento?\n4️⃣ Se não funcionar, perco tudo?\n5️⃣ Posso parcelar?\n\n0️⃣ Voltar às categorias`,

  r3_1: ()=> `*Valores completos:* 💰\n\n▶ Diagnóstico: *R$ 50* _(abatido se seguir)_\n▶ Entrada: *R$ 250*\n▶ Êxito: *R$ 450* _(só após resultado)_\n\n*Total real: R$ 650* — sendo que os R$ 450 finais só são cobrados quando seu nome já estiver limpo e você puder comprovar. Não tem surpresa.`,
  r3_2: ()=> `*Prazo de até 30 dias úteis.* ⏱️\n\nA maioria dos casos resolve antes. Casos simples, menos de 15 dias. O prazo exato depende da complexidade das restrições identificadas no seu diagnóstico.`,
  r3_3: ()=> `*No mesmo dia do pagamento da entrada.* ⚡\n\nAssim que confirmamos o pagamento e recebemos seus documentos, o processo é aberto e nossa equipe começa a trabalhar imediatamente.`,
  r3_4: ()=> `Você perde apenas os *R$ 250 de entrada* — que cobrem o trabalho jurídico realizado. \n\nOs *R$ 450 de êxito* só são cobrados se funcionar. Se não funcionar, esse valor não é cobrado. Período. 💪`,
  r3_5: ()=> `No momento trabalhamos com pagamento à vista via Pix. \n\nMas lembra: os R$ 450 de êxito só pagam após o resultado — então você não precisa ter o valor total agora. O desembolso é em etapas: R$ 50 agora, R$ 250 na entrada, R$ 450 só no final quando já tiver o nome limpo. 😊`,

  // Categoria 4 — Contrato e garantias
  cat4: ()=>
    `*Sobre contrato e garantias:* 📄\n\n1️⃣ Como funciona o contrato?\n2️⃣ Tenho garantia por escrito?\n3️⃣ Posso cancelar depois?\n4️⃣ O que preciso enviar?\n5️⃣ Como recebo o contrato?\n\n0️⃣ Voltar às categorias`,

  r4_1: ()=> `*Contrato formal com tudo por escrito.* 📋\n\nO contrato inclui:\n✅ Identificação completa das partes\n✅ Descrição do serviço e escopo\n✅ Prazo de até 30 dias úteis\n✅ Cláusula de êxito (R$ 450 só após resultado)\n✅ Obrigações de ambas as partes\n✅ Política de cancelamento`,
  r4_2: ()=> `*Sim, garantia por escrito no contrato.* ✅\n\nA principal garantia: os R$ 450 de êxito são cobrados *somente após* a remoção dos apontamentos ser comprovada. Se não houver resultado, não há cobrança do êxito. Isso fica registrado em contrato.`,
  r4_3: ()=> `*Sim, você pode cancelar.* 📋\n\nO contrato tem política de cancelamento clara. Recomendamos ler com atenção antes de assinar. Nossa equipe esclarece qualquer dúvida sobre os termos antes da assinatura.`,
  r4_4: ()=> `Muito simples! Precisamos apenas de:\n\n📸 *Foto do RG* (frente e verso)\n📸 *Foto do CPF*\n\nAlém do seu nome completo e CPF que você já nos forneceu no diagnóstico. Nada mais.`,
  r4_5: ()=> `O contrato é enviado *digitalmente aqui mesmo no WhatsApp* após o pagamento da entrada.\n\nVocê assina de forma digital e recebe uma cópia. Tudo fica registrado e acessível quando precisar.`,

  // Categoria 5 — Resultado
  cat5: ()=>
    `*Sobre o resultado:* 🏆\n\n1️⃣ Como fico sabendo do resultado?\n2️⃣ Remove de todos os órgãos (Serasa, SPC)?\n3️⃣ Como funciona o bônus de score?\n4️⃣ O que acontece com a dívida depois?\n5️⃣ Posso pedir crédito logo após?\n\n0️⃣ Voltar às categorias`,

  r5_1: ()=> `Você fica sabendo *aqui mesmo pelo WhatsApp*. 📲\n\nNossa equipe envia atualizações do processo e avisa quando os apontamentos forem removidos. Você também pode consultar o Serasa/SPC a qualquer momento para acompanhar.`,
  r5_2: ()=> `*Sim, atuamos em todos os órgãos de restrição.* ✅\n\nSerasa, SPC, Boa Vista (SCPC), Quod e demais cadastros negativos. O objetivo é a remoção completa para que você volte a ter crédito em qualquer instituição.`,
  r5_3: ()=> `O bônus de score é um *serviço adicional incluído* no processo. 📈\n\nApós a remoção dos apontamentos, orientamos as melhores práticas para aumentar seu score rapidamente — movimentação em conta, pagamentos em dia, uso estratégico de crédito.\n\nAlguns clientes saem do processo com score acima de 700 pontos.`,
  r5_4: ()=> `A dívida pode continuar existindo juridicamente, mas *sem te impedir de ter crédito*. 💡\n\nO que removemos são os *apontamentos* — os registros negativos nos órgãos de proteção ao crédito. É isso que te impede de ter cartão, financiamento e crédito.\n\nCom os apontamentos removidos, o mercado te enxerga como cliente apto. ✅`,
  r5_5: ()=> `*Sim!* Assim que os apontamentos forem removidos, você já pode solicitar crédito normalmente. 🎉\n\nCartões, financiamentos, crédito no comércio — tudo fica disponível. Por isso também trabalhamos o score: pra você aproveitar ao máximo a liberação do nome.`,

  // Categoria 6 — Diagnóstico
  cat6: ()=>
    `*Sobre o diagnóstico de R$ 50:* 🔍\n\n1️⃣ O que é o diagnóstico exatamente?\n2️⃣ O R$ 50 é devolvido?\n3️⃣ E se não houver viabilidade?\n4️⃣ O diagnóstico é imediato?\n5️⃣ Preciso enviar documentos pro diagnóstico?\n\n0️⃣ Voltar às categorias`,

  r6_1: ()=> `O diagnóstico é uma *análise completa do seu CPF* feita por nossa equipe. 🔍\n\nVerificamos:\n• Todos os apontamentos ativos\n• Origem e data de cada dívida\n• Irregularidades jurídicas presentes\n• Viabilidade de atuação em cada caso\n\nVocê recebe um panorama real antes de qualquer decisão maior.`,
  r6_2: ()=> `*Não é devolvido* — mas é *abatido*. 💡\n\nSe você seguir com o processo completo, os R$ 50 do diagnóstico são descontados do valor final. Na prática, você não paga duas vezes.\n\nSe não houver viabilidade e você não seguir, os R$ 50 cobrem o custo real da análise realizada.`,
  r6_3: ()=> `Se não houver viabilidade jurídica no seu caso, você *saberá com clareza* — e não perde mais nada além dos R$ 50. 🙏\n\nSomos honestos: preferimos dizer que não tem viabilidade do que cobrar R$ 250 de entrada sem perspectiva real de resultado.`,
  r6_4: ()=> `A análise é feita assim que confirmamos seu pagamento. ⚡\n\nVocê receberá o resultado *nessa mesma conversa* em instantes. Não precisa aguardar dias.`,
  r6_5: ()=> `*Não precisa enviar nada pro diagnóstico.* 😊\n\nApenas seu *nome completo e CPF* — que você já nos fornece aqui no chat. Os documentos (RG e CPF físico) só são solicitados depois, na fase do contrato.`,

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
    if (etapa===0 || etapa===17 || isOi(rawMsg)) {
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
      else if (num==="3") { c.etapa=220; reply=M.menu_categorias(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.menu_retorno(n); }

    // ── E22: menu categorias ─────────────────────────────────
    } else if (etapa===22) {
      c.etapa=220; reply=M.menu_categorias();

    // ── E220: escolhe categoria ───────────────────────────────
    } else if (etapa===220) {
      if      (num==="1") { c.etapa=221; reply=M.cat1(); }
      else if (num==="2") { c.etapa=222; reply=M.cat2(); }
      else if (num==="3") { c.etapa=223; reply=M.cat3(); }
      else if (num==="4") { c.etapa=224; reply=M.cat4(); }
      else if (num==="5") { c.etapa=225; reply=M.cat5(); }
      else if (num==="6") { c.etapa=226; reply=M.cat6(); }
      else if (num==="7") { c.etapa=3;   reply=M.onde(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.menu_categorias(); }

    // ── E221: serviço ─────────────────────────────────────────
    } else if (etapa===221) {
      if      (num==="1") { reply=M.r1_1()+"\n\n"+M.cat1(); }
      else if (num==="2") { reply=M.r1_2()+"\n\n"+M.cat1(); }
      else if (num==="3") { reply=M.r1_3()+"\n\n"+M.cat1(); }
      else if (num==="4") { reply=M.r1_4()+"\n\n"+M.cat1(); }
      else if (num==="5") { reply=M.r1_5()+"\n\n"+M.cat1(); }
      else if (num==="0") { c.etapa=220; reply=M.menu_categorias(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.cat1(); }

    // ── E222: confiança ───────────────────────────────────────
    } else if (etapa===222) {
      if      (num==="1") { reply=M.r2_1()+"\n\n"+M.cat2(); }
      else if (num==="2") { reply=M.r2_2()+"\n\n"+M.cat2(); }
      else if (num==="3") { reply=M.r2_3()+"\n\n"+M.cat2(); }
      else if (num==="4") { reply=M.r2_4()+"\n\n"+M.cat2(); }
      else if (num==="5") { reply=M.r2_5()+"\n\n"+M.cat2(); }
      else if (num==="0") { c.etapa=220; reply=M.menu_categorias(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.cat2(); }

    // ── E223: valores e prazo ─────────────────────────────────
    } else if (etapa===223) {
      if      (num==="1") { reply=M.r3_1()+"\n\n"+M.cat3(); }
      else if (num==="2") { reply=M.r3_2()+"\n\n"+M.cat3(); }
      else if (num==="3") { reply=M.r3_3()+"\n\n"+M.cat3(); }
      else if (num==="4") { reply=M.r3_4()+"\n\n"+M.cat3(); }
      else if (num==="5") { reply=M.r3_5()+"\n\n"+M.cat3(); }
      else if (num==="0") { c.etapa=220; reply=M.menu_categorias(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.cat3(); }

    // ── E224: contrato e garantias ────────────────────────────
    } else if (etapa===224) {
      if      (num==="1") { reply=M.r4_1()+"\n\n"+M.cat4(); }
      else if (num==="2") { reply=M.r4_2()+"\n\n"+M.cat4(); }
      else if (num==="3") { reply=M.r4_3()+"\n\n"+M.cat4(); }
      else if (num==="4") { reply=M.r4_4()+"\n\n"+M.cat4(); }
      else if (num==="5") { reply=M.r4_5()+"\n\n"+M.cat4(); }
      else if (num==="0") { c.etapa=220; reply=M.menu_categorias(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.cat4(); }

    // ── E225: resultado ───────────────────────────────────────
    } else if (etapa===225) {
      if      (num==="1") { reply=M.r5_1()+"\n\n"+M.cat5(); }
      else if (num==="2") { reply=M.r5_2()+"\n\n"+M.cat5(); }
      else if (num==="3") { reply=M.r5_3()+"\n\n"+M.cat5(); }
      else if (num==="4") { reply=M.r5_4()+"\n\n"+M.cat5(); }
      else if (num==="5") { reply=M.r5_5()+"\n\n"+M.cat5(); }
      else if (num==="0") { c.etapa=220; reply=M.menu_categorias(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.cat5(); }

    // ── E226: diagnóstico R$50 ────────────────────────────────
    } else if (etapa===226) {
      if      (num==="1") { reply=M.r6_1()+"\n\n"+M.cat6(); }
      else if (num==="2") { reply=M.r6_2()+"\n\n"+M.cat6(); }
      else if (num==="3") { reply=M.r6_3()+"\n\n"+M.cat6(); }
      else if (num==="4") { reply=M.r6_4()+"\n\n"+M.cat6(); }
      else if (num==="5") { reply=M.r6_5()+"\n\n"+M.cat6(); }
      else if (num==="0") { c.etapa=220; reply=M.menu_categorias(); }
      else                { reply=M.nao_entendi()+"\n\n"+M.cat6(); }

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
