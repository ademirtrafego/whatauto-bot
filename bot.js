const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const { Redis }  = require("@upstash/redis");
const QRCode     = require("qrcode");
const express    = require("express");
const pino       = require("pino");
const fs         = require("fs");
const path       = require("path");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Credenciais ───────────────────────────────────────────────
const redis = new Redis({
  url:   "https://gorgeous-warthog-98319.upstash.io",
  token: "gQAAAAAAAYAPAAIncDIwNjA2ZjEyZDUwZGQ0YTJmOGEyOWExMzk5ODIwOTI4MnAyOTgzMTk",
});
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : process.env.BASE_URL || "https://whatauto-bot-production.up.railway.app";

// ── Estado global do bot ──────────────────────────────────────
let sock         = null;
let qrCodeBase64 = null;
let botStatus    = "desconectado"; // desconectado | aguardando_qr | conectado
let authDir      = "/tmp/auth_info_baileys";

// ─────────────────────────────────────────────────────────────
//  PIX QR CODE
// ─────────────────────────────────────────────────────────────
function pf(id,v){return `${id}${String(v.length).padStart(2,"0")}${v}`;}
function pcrc(s){let c=0xFFFF;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021):(c<<1);}return(c&0xFFFF).toString(16).toUpperCase().padStart(4,"0");}
function pixPayload(valor){
  const ma=pf("00","BR.GOV.BCB.PIX")+pf("01","justhelpadv@gmail.com");
  const p=pf("00","01")+pf("01","12")+pf("26",ma)+pf("52","0000")+pf("53","986")+pf("54",Number(valor).toFixed(2))+pf("58","BR")+pf("59","JustHelp Adv")+pf("60","Sao Paulo")+pf("62",pf("05","JUSTHELPADV"))+"6304";
  return p+pcrc(p);
}
async function paginaPix(valor){
  const code=pixPayload(valor);
  const qr=await QRCode.toDataURL(code,{width:260,margin:2});
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagar R$ ${Number(valor).toFixed(2).replace(".",",")} — JustHelp</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}.card{background:#fff;border-radius:20px;padding:28px 22px;max-width:360px;width:100%;text-align:center}.logo{background:#1D7874;color:#fff;border-radius:10px;padding:8px 18px;display:inline-block;font-weight:700;font-size:17px;margin-bottom:14px}.valor{font-size:36px;font-weight:700;color:#1D7874}.sub{color:#888;font-size:13px;margin-bottom:18px}.qr{background:#f8f9fa;border-radius:14px;padding:14px;display:inline-block;margin-bottom:16px}.qr img{display:block;width:230px;height:230px}.steps{text-align:left;margin-bottom:14px}.step{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#444}.step:last-child{border:none}.n{background:#1D7874;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px}.copia{background:#f8f9fa;border-radius:10px;padding:10px;font-family:monospace;font-size:10px;color:#333;word-break:break-all;margin-bottom:10px;text-align:left;line-height:1.5}.btn{width:100%;padding:14px;border-radius:10px;border:none;font-size:15px;font-weight:700;cursor:pointer;background:#1D7874;color:#fff}.ok{background:#22c55e}.aviso{font-size:11px;color:#aaa;margin-top:12px}</style></head>
<body><div class="card"><div class="logo">JustHelp</div><div class="valor">R$ ${Number(valor).toFixed(2).replace(".",",")}</div><div class="sub">${valor==50?"Diagnóstico de CPF":"Entrada — Restauração de Crédito"}</div><div class="qr"><img src="${qr}" alt="QR Pix"></div>
<div class="steps"><div class="step"><span class="n">1</span><span>Abra seu banco ou app</span></div><div class="step"><span class="n">2</span><span>Pix → QR Code ou Copia e Cola</span></div><div class="step"><span class="n">3</span><span>Confirme e pague</span></div></div>
<div class="copia" id="cod">${code}</div><button class="btn" id="btn" onclick="copy()">📋 Copiar código Pix</button>
<div class="aviso">⚠️ Após pagar, volte ao WhatsApp e envie o comprovante.</div></div>
<script>function copy(){navigator.clipboard.writeText(document.getElementById('cod').textContent).then(()=>{const b=document.getElementById('btn');b.textContent='✅ Copiado!';b.classList.add('ok');setTimeout(()=>{b.textContent='📋 Copiar código Pix';b.classList.remove('ok')},3000)})}</script></body></html>`;
}

// ─────────────────────────────────────────────────────────────
//  ESTADO DOS LEADS
// ─────────────────────────────────────────────────────────────
async function get(id)    { try{return(await redis.get(`c:${id}`))||novo();}catch{return novo();} }
async function save(id,c) { try{await redis.set(`c:${id}`,c);}catch(e){console.error("redis:",e.message);} }
function novo() { return { etapa:0, nome:"", cpf:"", dados:"", modoHumano:false }; }
function nomeF(t) { return t.trim().split(" ").map(p=>p.charAt(0).toUpperCase()+p.slice(1).toLowerCase()).join(" "); }
function isOi(msg) { return /^(oi|ol[aá]|oii+|bom dia|boa tarde|boa noite|hello|hi|opa|salve|al[oô]|menu|inicio|start|começar)[\s!?.]*$/i.test(msg.trim()); }

// ─────────────────────────────────────────────────────────────
//  IMPORTAR LÓGICA DO FLUXO (do server.js)
//  Todas as mensagens e handlers ficam aqui inline
// ─────────────────────────────────────────────────────────────
// Carrega o módulo de fluxo separado
const { processarMensagem } = require("./fluxo");

// ─────────────────────────────────────────────────────────────
//  BAILEYS — conectar ao WhatsApp
// ─────────────────────────────────────────────────────────────
async function conectarWhatsApp() {
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["JustHelp Bot", "Chrome", "1.0"],
    markOnlineOnConnect: false,
  });

  // QR Code
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      botStatus = "aguardando_qr";
      qrCodeBase64 = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
      console.log("📱 QR Code gerado — acesse /qr para escanear");
    }
    if (connection === "open") {
      botStatus = "conectado";
      qrCodeBase64 = null;
      console.log("✅ WhatsApp conectado!");
    }
    if (connection === "close") {
      botStatus = "desconectado";
      const code = lastDisconnect?.error?.output?.statusCode;
      const reconectar = code !== DisconnectReason.loggedOut;
      console.log("❌ Desconectado. Código:", code, "| Reconectar:", reconectar);
      if (reconectar) {
        setTimeout(conectarWhatsApp, 3000);
      } else {
        // Limpar sessão e exibir QR novo
        fs.rmSync(authDir, { recursive: true, force: true });
        setTimeout(conectarWhatsApp, 1000);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // ── Receber mensagens ─────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;           // ignora mensagens próprias
      if (msg.key.remoteJid?.endsWith("@g.us")) continue; // ignora grupos

      const jid    = msg.key.remoteJid;
      const telNum = jid.replace("@s.whatsapp.net", "");

      // Extrai o texto da mensagem (texto, legenda de imagem, etc.)
      const texto =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.documentMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

      console.log(`📩 [${telNum}] "${texto.substring(0,60)}"`);

      try {
        const resposta = await processarMensagem(telNum, texto, BASE_URL, redis, save, get, novo, nomeF, isOi);
        if (resposta && resposta.trim()) {
          // Formata bold: *texto* → funciona nativamente no WhatsApp
          await sock.sendMessage(jid, { text: resposta });
        }
      } catch (e) {
        console.error("Erro ao processar:", e.message);
        await sock.sendMessage(jid, { text: "Desculpe, tive um problema técnico. Pode repetir?" });
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
//  ROTAS WEB
// ─────────────────────────────────────────────────────────────

// Página de conexão QR
app.get("/qr", (req, res) => {
  const statusColor = { conectado:"#22c55e", aguardando_qr:"#f59e0b", desconectado:"#ef4444" }[botStatus];
  const statusLabel = { conectado:"Conectado ✅", aguardando_qr:"Aguardando escaneamento 📱", desconectado:"Desconectado ❌" }[botStatus];

  res.setHeader("Content-Type","text/html;charset=utf-8");
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>JustHelp — Conexão WhatsApp</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#fff;border-radius:20px;padding:32px 28px;max-width:420px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}.logo{background:#1D7874;color:#fff;border-radius:12px;padding:10px 20px;display:inline-block;font-weight:700;font-size:18px;margin-bottom:20px}.badge{display:inline-block;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:500;margin-bottom:20px;color:#fff;background:${statusColor}}.qr-box{background:#f8f9fa;border-radius:16px;padding:16px;display:inline-block;margin-bottom:20px}.steps{text-align:left;font-size:13px;color:#555;line-height:1.8}.step{padding:4px 0}.ok{color:#22c55e;font-size:13px;margin-top:16px;padding:12px;background:#f0fdf4;border-radius:10px}</style></head>
<body><div class="card">
<div class="logo">JustHelp</div>
<div class="badge">${statusLabel}</div>
${botStatus==="aguardando_qr" && qrCodeBase64 ? `
<div class="qr-box"><img src="${qrCodeBase64}" width="260" height="260" alt="QR Code"></div>
<div class="steps">
  <div class="step">1️⃣ Abra o WhatsApp no celular</div>
  <div class="step">2️⃣ Toque em <strong>Menu (⋮) → Aparelhos conectados</strong></div>
  <div class="step">3️⃣ Toque em <strong>Conectar aparelho</strong></div>
  <div class="step">4️⃣ Escaneie este QR Code</div>
</div>
` : botStatus==="conectado" ? `
<div class="ok">✅ WhatsApp conectado! O bot está respondendo automaticamente.<br><br><a href="/dashboard" style="color:#1D7874;font-weight:500">Ver Dashboard de Leads →</a></div>
` : `
<div style="color:#888;font-size:14px;margin:20px 0">Conectando... aguarde alguns segundos.</div>
`}
<p style="font-size:11px;color:#aaa;margin-top:16px">Página atualiza automaticamente a cada 5 segundos</p>
</div></body></html>`);
});

// Dashboard
app.get("/dashboard", async (req,res) => {
  const keys=await redis.keys("c:*");
  const vals=keys.length ? await Promise.all(keys.map(k=>redis.get(k))) : [];
  const leads=keys.map((k,i)=>({id:k.replace("c:",""),...vals[i]})).filter(c=>c.nome&&!c.id.startsWith("teste_"));
  const etapaLabel={0:"Início",1:"Aguard. nome",2:"Menu",3:"Restrições",4:"Tempo",5:"Tentou?",50:"Âncora",51:"Valor dívida",6:"Posicionamento",7:"Coletando dados",8:"Aguard. Pix R$50",9:"Analisando",10:"Diagnóstico",11:"Resultado",12:"Oferta processo",13:"Aguard. Pix R$250",14:"Aguard. RG",15:"Aguard. CPF",16:"Docs recebidos",17:"✅ Processo aberto"};
  const rows=leads.sort((a,b)=>(b.ultimaMsg||0)-(a.ultimaMsg||0)).map(l=>{
    const etLabel=etapaLabel[l.etapa]||`E${l.etapa}`;
    const ultima=l.ultimaMsg?new Date(l.ultimaMsg).toLocaleString("pt-BR"):"—";
    const pago50=l.etapa>=8?"✅":"—";
    const pago250=l.etapa>=13?"✅":"—";
    return `<tr><td>${l.nome}</td><td style="font-family:monospace;font-size:11px">${l.id}</td><td>${etLabel}</td><td style="text-align:center">${pago50}</td><td style="text-align:center">${pago250}</td><td style="font-size:11px">${ultima}</td><td><button onclick="resetar('${l.id}')" style="font-size:11px;padding:2px 8px;cursor:pointer;border:1px solid #ddd;border-radius:4px">Reset</button></td></tr>`;
  }).join("");
  res.setHeader("Content-Type","text/html;charset=utf-8");
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dashboard — JustHelp</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f0f2f5;padding:20px}h1{color:#1D7874;margin-bottom:16px;font-size:22px;display:flex;align-items:center;gap:10px}.status{font-size:12px;padding:4px 12px;border-radius:20px;background:${botStatus==="conectado"?"#22c55e":"#ef4444"};color:#fff;font-weight:500}.cards{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}.card{background:#fff;border-radius:12px;padding:14px 18px;min-width:130px;box-shadow:0 2px 8px rgba(0,0,0,.06)}.card-n{font-size:30px;font-weight:700;color:#1D7874}.card-l{font-size:11px;color:#888;margin-top:2px}.nav{display:flex;gap:10px;margin-bottom:16px}.nav a{color:#1D7874;text-decoration:none;font-size:13px;padding:6px 14px;border:1px solid #1D7874;border-radius:8px}table{width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);border-collapse:collapse}th{background:#1D7874;color:#fff;padding:10px 12px;text-align:left;font-size:12px;font-weight:500}td{padding:9px 12px;font-size:13px;border-bottom:1px solid #f0f0f0;vertical-align:middle}tr:hover td{background:#f8f9fa}</style></head>
<body>
<h1>🤖 JustHelp — Dashboard <span class="status">${botStatus==="conectado"?"Online":"Offline"}</span></h1>
<div class="nav"><a href="/qr">📱 Conexão QR</a><a href="/notificacoes">💰 Pagamentos</a></div>
<div class="cards">
  <div class="card"><div class="card-n">${leads.length}</div><div class="card-l">Total leads</div></div>
  <div class="card"><div class="card-n">${leads.filter(l=>l.etapa>0&&l.etapa<17).length}</div><div class="card-l">Em andamento</div></div>
  <div class="card"><div class="card-n">${leads.filter(l=>l.etapa>=8).length}</div><div class="card-l">Pagaram R$50</div></div>
  <div class="card"><div class="card-n">${leads.filter(l=>l.etapa>=13).length}</div><div class="card-l">Pagaram R$250</div></div>
  <div class="card"><div class="card-n">${leads.filter(l=>l.etapa===17).length}</div><div class="card-l">Processos abertos</div></div>
</div>
<table><thead><tr><th>Nome</th><th>Telefone</th><th>Etapa</th><th>R$50</th><th>R$250</th><th>Última msg</th><th>Ação</th></tr></thead>
<tbody>${rows||"<tr><td colspan='7' style='text-align:center;padding:30px;color:#aaa'>Nenhum lead ainda</td></tr>"}</tbody></table>
<script>async function resetar(tel){if(!confirm("Resetar "+tel+"?"))return;await fetch("/resetar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({telefone:tel})});location.reload();}</script>
</body></html>`);
});

// Notificações
app.get("/notificacoes", async (req,res) => {
  const notifs=await redis.lrange("notifs",0,99).catch(()=>[]);
  res.setHeader("Content-Type","text/html;charset=utf-8");
  const rows=notifs.map(n=>{try{const p=JSON.parse(n);return`<tr><td>${p.data}</td><td>${p.nome}</td><td style="font-family:monospace;font-size:11px">${p.tel}</td><td style="color:#1D7874;font-weight:600">${p.valor}</td></tr>`;}catch{return "";}}).join("");
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pagamentos — JustHelp</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;padding:20px;background:#f0f2f5}h1{color:#1D7874;margin-bottom:16px}.nav{margin-bottom:16px}.nav a{color:#1D7874;text-decoration:none;font-size:13px;padding:6px 14px;border:1px solid #1D7874;border-radius:8px}table{width:100%;background:#fff;border-radius:12px;overflow:hidden;border-collapse:collapse;box-shadow:0 2px 8px rgba(0,0,0,.06)}th{background:#1D7874;color:#fff;padding:10px 12px;text-align:left;font-size:12px}td{padding:10px 12px;font-size:13px;border-bottom:1px solid #f0f0f0}</style></head>
<body><h1>💰 Pagamentos Recebidos</h1>
<div class="nav"><a href="/dashboard">← Dashboard</a></div>
<table><thead><tr><th>Data/Hora</th><th>Nome</th><th>Telefone</th><th>Valor</th></tr></thead>
<tbody>${rows||"<tr><td colspan='4' style='text-align:center;padding:20px;color:#aaa'>Nenhum pagamento ainda</td></tr>"}</tbody></table>
</body></html>`);
});

// Pix
app.get("/pix/:valor", async (req,res) => {
  try { const v=parseFloat(req.params.valor); res.setHeader("Content-Type","text/html;charset=utf-8"); res.send(await paginaPix(v)); }
  catch(e){ res.status(500).send("Erro: "+e.message); }
});

// Admin
app.post("/resetar", async (req,res) => { await redis.del(`c:${req.body.telefone}`); res.json({ok:true}); });
app.post("/assumir", async (req,res) => { const c=await get(req.body.telefone); c.modoHumano=true;  await save(req.body.telefone,c); res.json({ok:true}); });
app.post("/liberar", async (req,res) => { const c=await get(req.body.telefone); c.modoHumano=false; await save(req.body.telefone,c); res.json({ok:true}); });
app.get("/debug",    async (req,res) => { const rok=await redis.ping().then(()=>true).catch(()=>false); res.json({status:"ok",redis:rok,botStatus,baseUrl:BASE_URL}); });
app.get("/",         (_,res) => res.redirect("/qr"));

// ─────────────────────────────────────────────────────────────
//  INICIAR
// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ JustHelp Bot | porta ${PORT}`));
conectarWhatsApp().catch(console.error);
