const QRCode = require("qrcode");

function field(id, value) {
  return `${id}${String(value.length).padStart(2,"0")}${value}`;
}

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
}

function gerarPayload(chave, nome, cidade, valor) {
  const mercAcc = field("00","BR.GOV.BCB.PIX") + field("01", chave);
  const addData = field("05","JUSTHELPADV");
  const payload =
    field("00","01") +
    field("01","12") +
    field("26", mercAcc) +
    field("52","0000") +
    field("53","986") +
    field("54", Number(valor).toFixed(2)) +
    field("58","BR") +
    field("59", nome.substring(0,25)) +
    field("60", cidade.substring(0,15)) +
    field("62", addData) +
    "6304";
  return payload + crc16(payload);
}

async function gerarPaginaPix(valor, label) {
  const chave = "justhelpadv@gmail.com";
  const nome  = "JustHelp Adv";
  const cidade = "Sao Paulo";
  const payload = gerarPayload(chave, nome, cidade, valor);
  const qrDataUrl = await QRCode.toDataURL(payload, { width: 280, margin: 2 });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pagar R$ ${Number(valor).toFixed(2).replace(".",",")} — JustHelp</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
  .card{background:#fff;border-radius:20px;padding:32px 24px;max-width:380px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center}
  .logo{background:#1D7874;color:#fff;border-radius:12px;padding:10px 20px;display:inline-block;font-weight:700;font-size:18px;margin-bottom:20px;letter-spacing:1px}
  .valor{font-size:38px;font-weight:700;color:#1D7874;margin-bottom:4px}
  .label{color:#888;font-size:14px;margin-bottom:24px}
  .qr{background:#f8f9fa;border-radius:16px;padding:16px;display:inline-block;margin-bottom:20px}
  .qr img{display:block;width:240px;height:240px}
  .steps{text-align:left;margin-bottom:20px}
  .step{display:flex;align-items:flex-start;gap:12px;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#444}
  .step:last-child{border:none}
  .step span.n{background:#1D7874;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:1px}
  .copia-area{background:#f8f9fa;border-radius:12px;padding:12px;font-family:monospace;font-size:11px;color:#333;word-break:break-all;margin-bottom:12px;text-align:left;line-height:1.5;max-height:80px;overflow:hidden}
  .btn{width:100%;padding:16px;border-radius:12px;border:none;font-size:16px;font-weight:700;cursor:pointer;transition:.2s}
  .btn-copy{background:#1D7874;color:#fff;margin-bottom:10px}
  .btn-copy:active{transform:scale(.98)}
  .btn-copy.copied{background:#22c55e}
  .aviso{font-size:12px;color:#aaa;margin-top:16px}
</style>
</head>
<body>
<div class="card">
  <div class="logo">JustHelp</div>
  <div class="valor">R$ ${Number(valor).toFixed(2).replace(".",",")}</div>
  <div class="label">${label}</div>
  <div class="qr"><img src="${qrDataUrl}" alt="QR Code Pix"></div>
  <div class="steps">
    <div class="step"><span class="n">1</span><span>Abra seu banco ou app de pagamentos</span></div>
    <div class="step"><span class="n">2</span><span>Escolha <strong>Pix</strong> → <strong>Ler QR Code</strong> ou <strong>Copia e Cola</strong></span></div>
    <div class="step"><span class="n">3</span><span>Escaneie o QR Code ou cole o código abaixo</span></div>
  </div>
  <div class="copia-area" id="pixcode">${payload}</div>
  <button class="btn btn-copy" id="copybtn" onclick="copiar()">📋 Copiar código Pix</button>
  <div class="aviso">⚠️ Após o pagamento, envie o comprovante no WhatsApp para confirmar.</div>
</div>
<script>
function copiar(){
  navigator.clipboard.writeText(document.getElementById("pixcode").textContent).then(()=>{
    const btn=document.getElementById("copybtn");
    btn.textContent="✅ Copiado!";
    btn.classList.add("copied");
    setTimeout(()=>{ btn.textContent="📋 Copiar código Pix"; btn.classList.remove("copied"); },3000);
  });
}
</script>
</body>
</html>`;
}

module.exports = { gerarPaginaPix };
