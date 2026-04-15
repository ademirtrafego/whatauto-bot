# JustHelp Bot — Setup Completo

## Arquitetura

```
WhatsApp ↔ Evolution API (Docker no Railway) ↔ server.js (Bot no Railway)
```

---

## PASSO 1 — Subir o Bot (server.js) no Railway

1. Acesse seu repositório GitHub `whatauto-bot`
2. Substitua o `server.js` e `package.json` pelos novos arquivos
3. O Railway faz o deploy automaticamente

---

## PASSO 2 — Criar o Evolution API no Railway

1. Acesse [railway.app](https://railway.app)
2. No seu projeto, clique em **"+ New"** → **"Docker Image"**
3. Cole a imagem: `atendai/evolution-api:latest`
4. Clique em **"Deploy"**
5. Vá em **Settings → Networking → Generate Domain**
6. Copie a URL gerada (ex: `https://evolution-xxx.railway.app`)

### Variáveis do Evolution API (Settings → Variables):
```
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=justhelp2024
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true
SERVER_PORT=8080
```

---

## PASSO 3 — Variáveis do Bot (server.js)

No Railway, clique no serviço do `server.js` → **Variables** → adicione:

```
EVOLUTION_URL  = https://evolution-xxx.railway.app
EVOLUTION_KEY  = justhelp2024
EVOLUTION_INST = justhelp
```

---

## PASSO 4 — Criar instância e conectar WhatsApp

### Criar instância via API:
Abra o navegador e acesse:
```
https://evolution-xxx.railway.app/instance/create
```

Ou use este comando curl:
```bash
curl -X POST https://evolution-xxx.railway.app/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: justhelp2024" \
  -d '{"instanceName":"justhelp","qrcode":true}'
```

### Pegar o QR Code:
```
https://evolution-xxx.railway.app/instance/qrcode/justhelp?image=true
```
Abra no navegador → escaneie com o WhatsApp

---

## PASSO 5 — Configurar Webhook

```bash
curl -X POST https://evolution-xxx.railway.app/webhook/set/justhelp \
  -H "Content-Type: application/json" \
  -H "apikey: justhelp2024" \
  -d '{
    "url": "https://whatauto-bot-production.up.railway.app/webhook",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

---

## PASSO 6 — Testar

1. Acesse `https://whatauto-bot-production.up.railway.app/debug`
2. Deve mostrar: `{"status":"ok","redis":true,"evolution":{"url":"https://...","keyOk":true}}`
3. Mande "Oi" para o seu número do WhatsApp
4. O bot deve responder automaticamente!

---

## Dashboard

- Leads em tempo real: `https://whatauto-bot-production.up.railway.app/dashboard`
- Pagamentos: `https://whatauto-bot-production.up.railway.app/notificacoes`

