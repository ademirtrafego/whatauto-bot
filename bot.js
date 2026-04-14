const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
} = require("@whiskeysockets/baileys");
const { Redis }  = require("@upstash/redis");
const QRCode     = require("qrcode");
const express    = require("express");
const pino       = require("pino");
const fs         = require("fs");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const redis = new Redis({
  url:   "https://gorgeous-warthog-98319.upstash.io",
  token: "gQAAAAAAAYAPAAIncDIwNjA2ZjEyZDUwZGQ0YTJmOGEyOWExMzk5ODIwOTI4MnAyOTgzMTk",
});
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : process.env.BASE_URL || "https://whatauto-bot-production.up.railway.app";

let sock=null, qrCodeBase64=null, botStatus="desconectado", tentativas=0;
const authDir="/tmp/auth_baileys";
const logs=[];
function log(m){const l=`[${new Date().toLocaleTimeString("pt-BR")}] ${m}`;console.log(l);logs.unshift(l);if(logs.length>60)logs.pop();}

// PIX ───────────────────────────────────────────────────────
function pf(id,v){return `${id}${String(v.length).padStart(2,"0")}${v}`;}
function pcrc(s){let c=0xFFFF;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021):(c<<1);}return(c&0xFFFF).toString(16).toUpperCase().padStart(4,"0");}
function pixPayload(valor){const ma=pf("00","BR.GOV.BCB.PIX")+pf("01","justhelpadv@gmail.com");const p=pf("00","01")+pf("01","12")+pf("26",ma)+pf("52","0000")+pf("53","986")+pf("54",Number(valor).toFixed(2))+pf("58","BR")+pf("59","JustHelp Adv")+pf("60","Sao Paulo")+pf("62",pf("05","JUSTHELPADV"))+"6304";return p+pcrc(p);}
async function paginaPix(valor){const code=pixPayload(valor);const qr=await QRCode.toDataURL(code,{width:260,margin:2});return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagar R$ ${Number(valor).toFixed(2).replace(".",",")} — JustHelp</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}.card{background:#fff;border-radius:20px;padding:28px 22px;max-width:360px;width:100%;text-align:center}.logo{background:#1D7874;color:#fff;border-radius:10px;padding:8px 18px;display:inline-block;font-weight:700;font-size:17px;margin-bottom:14px}.valor{font-size:36px;font-weight:700;color:#1D7874}.sub{color:#888;font-size:13px;margin-bottom:18px}.qr{background:#f8f9fa;border-radius:14px;padding:14px;display:inline-block;margin-bottom:16px}.qr img{display:block;width:230px;height:230px}.copia{background:#f8f9fa;border-radius:10px;padding:10px;font-family:monospace;font-size:10px;color:#333;word-break:break-all;margin-bottom:10px;text-align:left;line-height:1.5}.btn{width:100%;padding:14px;border-radius:10px;border:none;font-size:15px;font-weight:700;cursor:pointer;background:#1D7874;color:#fff}.ok{background:#22c55e}.aviso{font-size:11px;color:#aaa;margin-top:12px}</style></head><body><div class="card"><div class="logo">JustHelp</div><div class="valor">R$ ${Number(valor).toFixed(2).replace(".",",")}</div><div class="sub">${valor==50?"Diagnóstico de CPF":"Entrada — Restauração de Crédito"}</div><div class="qr"><img src="${qr}" alt="QR Pix"></div><div class="copia" id="cod">${code}</div><button class="btn" id="btn" onclick="copy()">📋 Copiar código Pix</button><div class="aviso">⚠️ Após pagar, volte ao WhatsApp e envie o comprovante.</div></div><script>function copy(){navigator.clipboard.writeText(document.getElementById('cod').textContent).then(()=>{const b=document.getElementById('btn');b.textContent='✅ Copiado!';b.classList.add('ok');setTimeout(()=>{b.textContent='📋 Copiar código Pix';b.classList.remove('ok')},3000)})}</script></body></html>`;}

// ESTADO ────────────────────────────────────────────────────
async function get(id){try{return(await redis.get(`c:${id}`))||novo();}catch{return novo();}}
async function save(id,c){try{await redis.set(`c:${id}`,c);}catch(e){log("Redis:"+e.message);}}
function novo(){return{etapa:0,nome:"",cpf:"",dados:"",modoHumano:false};}
function nomeF(t){return t.trim().split(" ").map(p=>p.charAt(0).toUpperCase()+p.slice(1).toLowerCase()).join(" ");}
function isOi(m){return /^(oi|ol[aá]|oii+|bom dia|boa tarde|boa noite|hello|hi|opa|salve|al[oô]|menu|inicio|start|começar)[\s!?.]*$/i.test(m.trim());}
const { processarMensagem } = require("./fluxo");

// BAILEYS ───────────────────────────────────────────────────
async function conectar() {
  try {
    tentativas++;
    log(`Tentativa ${tentativas} de conexão...`);
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir,{recursive:true});
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    sock = makeWASocket({
      version: [2,3000,1027934701],
      auth: state,
      logger: pino({level:"silent"}),
      printQRInTerminal: true,
      browser: Browsers.ubuntu("Chrome"),
      connectTimeoutMs: 30000,
      retryRequestDelayMs: 2000,
      maxMsgRetryCount: 3,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on("connection.update", async ({connection, lastDisconnect, qr}) => {
      if (qr) {
        log("QR Code pronto para escanear!");
        botStatus="aguardando_qr";
        qrCodeBase64=await QRCode.toDataURL(qr,{width:320,margin:2});
      }
      if (connection==="open") {
        tentativas=0;
        botStatus="conectado";
        qrCodeBase64=null;
        log("✅ WhatsApp conectado!");
      }
      if (connection==="close") {
        const code=lastDisconnect?.error?.output?.statusCode;
        botStatus="desconectado";
        log(`Fechado. Código: ${code}`);
        if (code===DisconnectReason.loggedOut) {
          log("Sessão expirada — removendo credenciais");
          fs.rmSync(authDir,{recursive:true,force:true});
          tentativas=0;
        }
        const delay=Math.min(5000*tentativas,30000);
        log(`Reconectando em ${delay/1000}s...`);
        setTimeout(conectar,delay);
      }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({messages,type}) => {
      if (type!=="notify") return;
      for (const msg of messages) {
        if (msg.key.fromMe||msg.key.remoteJid?.endsWith("@g.us")) continue;
        const jid=msg.key.remoteJid;
        const tel=jid.replace("@s.whatsapp.net","");
        const texto=msg.message?.conversation||msg.message?.extendedTextMessage?.text||msg.message?.imageMessage?.caption||msg.message?.documentMessage?.caption||msg.message?.videoMessage?.caption||"";
        log(`📩 [${tel}] "${texto.substring(0,50)}"`);
        try {
          const r=await processarMensagem(tel,texto,BASE_URL,redis,save,get,novo,nomeF,isOi);
          if (r?.trim()) await sock.sendMessage(jid,{text:r});
        } catch(e) {
          log("Erro msg: "+e.message);
          await sock.sendMessage(jid,{text:"Desculpe, problema técnico. Pode repetir?"}).catch(()=>{});
        }
      }
    });

  } catch(e) {
    log("Erro ao conectar: "+e.message);
    setTimeout(conectar, Math.min(5000*tentativas,30000));
  }
}

// ROTAS ─────────────────────────────────────────────────────
const style=`<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#fff;border-radius:20px;padding:32px 26px;max-width:440px;width:100%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.08)}.logo{background:#1D7874;color:#fff;border-radius:12px;padding:10px 22px;display:inline-block;font-weight:700;font-size:19px;margin-bottom:16px}.badge{display:inline-block;padding:6px 18px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:20px;color:#fff}.qr-wrap{background:#f8f9fa;border-radius:16px;padding:18px;display:inline-block;margin-bottom:18px}.steps{text-align:left;font-size:13px;color:#555;line-height:2.1;margin-bottom:14px}.ok-box{background:#f0fdf4;border-radius:12px;padding:14px;color:#166534;font-size:14px;line-height:1.7}.ok-box a{color:#1D7874;font-weight:600;text-decoration:none}.logs{text-align:left;background:#111;border-radius:10px;padding:12px;margin-top:14px;max-height:150px;overflow-y:auto}.logs p{font-family:monospace;font-size:11px;color:#9ca;margin:2px 0}.hint{font-size:11px;color:#bbb;margin-top:10px}</style>`;

app.get("/qr",(req,res)=>{
  const cor={conectado:"#22c55e",aguardando_qr:"#f59e0b",desconectado:"#ef4444"}[botStatus];
  const label={conectado:"Conectado ✅",aguardando_qr:"Escaneie o QR Code 📱",desconectado:"Aguardando conexão..."}[botStatus];
  res.setHeader("Content-Type","text/html;charset=utf-8");
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="4"><title>JustHelp — Conexão</title>${style}</head><body><div class="card"><div class="logo">JustHelp</div><div class="badge" style="background:${cor}">${label}</div>${
  botStatus==="aguardando_qr"&&qrCodeBase64?`<div class="qr-wrap"><img src="${qrCodeBase64}" width="280" height="280"></div><div class="steps"><div>1️⃣ Abra o <strong>WhatsApp</strong> no celular</div><div>2️⃣ Menu <strong>⋮</strong> → <strong>Aparelhos conectados</strong></div><div>3️⃣ Toque em <strong>Conectar aparelho</strong></div><div>4️⃣ Aponte a câmera para este QR Code</div></div>`:
  botStatus==="conectado"?`<div class="ok-box">✅ <strong>WhatsApp conectado!</strong><br><br>O bot está respondendo automaticamente.<br><br><a href="/dashboard">📊 Dashboard de Leads →</a></div>`:
  `<div style="color:#999;font-size:13px;padding:16px 0">🔄 Gerando QR Code...<br><span style="font-size:11px">Tentativa ${tentativas}</span></div>`
  }<div class="logs">${logs.slice(0,10).map(l=>`<p>${l}</p>`).join("")||"<p style='color:#555'>Aguardando...</p>"}</div><p class="hint">Atualiza a cada 4 segundos</p></div></body></html>`);
});

app.get("/dashboard",async(req,res)=>{
  const keys=await redis.keys("c:*").catch(()=>[]);
  const vals=keys.length?await Promise.all(keys.map(k=>redis.get(k))):[];
  const leads=keys.map((k,i)=>({id:k.replace("c:",""),...vals[i]})).filter(c=>c.nome&&!c.id.startsWith("teste_"));
  const eL={0:"Início",1:"Nome",2:"Menu",3:"Restrições",4:"Tempo",5:"Tentou?",50:"Âncora",51:"Valor",6:"Posicionamento",7:"Dados",8:"Pix R$50",9:"Analisando",10:"Diagnóstico",11:"Resultado",12:"Oferta",13:"Pix R$250",14:"RG",15:"CPF",16:"Docs",17:"✅ Aberto"};
  const rows=leads.sort((a,b)=>(b.ultimaMsg||0)-(a.ultimaMsg||0)).map(l=>`<tr><td>${l.nome}</td><td style="font-family:monospace;font-size:11px">${l.id}</td><td>${eL[l.etapa]||`E${l.etapa}`}</td><td style="text-align:center">${l.etapa>=8?"✅":"—"}</td><td style="text-align:center">${l.etapa>=13?"✅":"—"}</td><td style="font-size:11px">${l.ultimaMsg?new Date(l.ultimaMsg).toLocaleString("pt-BR"):"—"}</td><td><button onclick="resetar('${l.id}')">Reset</button></td></tr>`).join("");
  const cor=botStatus==="conectado"?"#22c55e":"#ef4444";
  res.setHeader("Content-Type","text/html;charset=utf-8");
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dashboard — JustHelp</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#f0f2f5;padding:20px}h1{color:#1D7874;margin-bottom:12px;font-size:20px}.badge{font-size:11px;padding:2px 10px;border-radius:10px;color:#fff;background:${cor};vertical-align:middle;margin-left:8px}.nav{display:flex;gap:10px;margin-bottom:14px}.nav a{color:#1D7874;font-size:13px;padding:5px 14px;border:1px solid #1D7874;border-radius:8px;text-decoration:none}.cards{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}.c{background:#fff;border-radius:10px;padding:12px 16px;min-width:120px}.cn{font-size:26px;font-weight:700;color:#1D7874}.cl{font-size:11px;color:#888;margin-top:2px}table{width:100%;background:#fff;border-radius:10px;overflow:hidden;border-collapse:collapse}th{background:#1D7874;color:#fff;padding:9px 11px;text-align:left;font-size:12px}td{padding:8px 11px;font-size:12px;border-bottom:1px solid #f0f0f0}tr:hover td{background:#f8f9fa}button{font-size:11px;padding:2px 8px;cursor:pointer;border:1px solid #ddd;border-radius:4px}</style></head><body>
  <h1>🤖 JustHelp <span class="badge">${botStatus==="conectado"?"Online":"Offline"}</span></h1>
  <div class="nav"><a href="/qr">📱 Conexão</a><a href="/notificacoes">💰 Pagamentos</a></div>
  <div class="cards"><div class="c"><div class="cn">${leads.length}</div><div class="cl">Total leads</div></div><div class="c"><div class="cn">${leads.filter(l=>l.etapa>0&&l.etapa<17).length}</div><div class="cl">Em andamento</div></div><div class="c"><div class="cn">${leads.filter(l=>l.etapa>=8).length}</div><div class="cl">Pagaram R$50</div></div><div class="c"><div class="cn">${leads.filter(l=>l.etapa>=13).length}</div><div class="cl">Pagaram R$250</div></div><div class="c"><div class="cn">${leads.filter(l=>l.etapa===17).length}</div><div class="cl">Processos</div></div></div>
  <table><thead><tr><th>Nome</th><th>Telefone</th><th>Etapa</th><th>R$50</th><th>R$250</th><th>Última msg</th><th></th></tr></thead><tbody>${rows||"<tr><td colspan='7' style='text-align:center;padding:24px;color:#aaa'>Nenhum lead ainda</td></tr>"}</tbody></table>
  <script>async function resetar(t){if(!confirm("Resetar "+t+"?"))return;await fetch("/resetar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({telefone:t})});location.reload();}</script>
  </body></html>`);
});

app.get("/notificacoes",async(req,res)=>{
  const n=await redis.lrange("notifs",0,99).catch(()=>[]);
  const rows=n.map(x=>{try{const p=JSON.parse(x);return`<tr><td>${p.data}</td><td>${p.nome}</td><td style="font-family:monospace;font-size:11px">${p.tel}</td><td style="color:#1D7874;font-weight:600">${p.valor}</td></tr>`;}catch{return "";}}).join("");
  res.setHeader("Content-Type","text/html;charset=utf-8");
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pagamentos</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;padding:20px;background:#f0f2f5}h1{color:#1D7874;margin-bottom:12px}.nav{margin-bottom:12px}.nav a{color:#1D7874;font-size:13px;padding:5px 14px;border:1px solid #1D7874;border-radius:8px;text-decoration:none}table{width:100%;background:#fff;border-radius:10px;overflow:hidden;border-collapse:collapse}th{background:#1D7874;color:#fff;padding:9px 11px;text-align:left;font-size:12px}td{padding:9px 11px;font-size:13px;border-bottom:1px solid #f0f0f0}</style></head><body><h1>💰 Pagamentos</h1><div class="nav"><a href="/dashboard">← Dashboard</a></div><table><thead><tr><th>Data</th><th>Nome</th><th>Telefone</th><th>Valor</th></tr></thead><tbody>${rows||"<tr><td colspan='4' style='text-align:center;padding:20px;color:#aaa'>Nenhum pagamento</td></tr>"}</tbody></table></body></html>`);
});

app.get("/pix/:v",async(req,res)=>{try{res.setHeader("Content-Type","text/html;charset=utf-8");res.send(await paginaPix(parseFloat(req.params.v)));}catch(e){res.status(500).send(e.message);}});
app.get("/debug",async(req,res)=>{const r=await redis.ping().then(()=>true).catch(()=>false);res.json({botStatus,tentativas,redis:r,logs:logs.slice(0,15),baseUrl:BASE_URL});});
app.post("/resetar",async(req,res)=>{await redis.del(`c:${req.body.telefone}`);res.json({ok:true});});
app.post("/assumir",async(req,res)=>{const c=await get(req.body.telefone);c.modoHumano=true; await save(req.body.telefone,c);res.json({ok:true});});
app.post("/liberar",async(req,res)=>{const c=await get(req.body.telefone);c.modoHumano=false;await save(req.body.telefone,c);res.json({ok:true});});
app.get("/",(_,res)=>res.redirect("/qr"));

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>log(`Servidor na porta ${PORT} | ${BASE_URL}`));
conectar().catch(e=>{log("Erro inicial: "+e.message);setTimeout(conectar,5000);});
