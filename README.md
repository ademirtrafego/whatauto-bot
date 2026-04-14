# 🤖 Bot de Restauração de Crédito — Whatauto

Servidor webhook para automatizar o atendimento de 11 etapas no Whatauto via WhatsApp.

---

## 🚀 Como publicar (GitHub + Railway)

### PASSO 1 — Criar repositório no GitHub

1. Acesse [github.com](https://github.com) e faça login (ou crie uma conta grátis)
2. Clique em **"New repository"**
3. Nome: `whatauto-bot`
4. Deixe **Public** e clique em **"Create repository"**
5. Faça upload de todos os arquivos deste projeto

---

### PASSO 2 — Subir os arquivos

Na página do repositório criado, clique em **"uploading an existing file"** e envie:
- `server.js`
- `package.json`
- `.gitignore`

---

### PASSO 3 — Criar servidor no Railway (grátis)

1. Acesse [railway.app](https://railway.app)
2. Clique em **"Start a New Project"**
3. Escolha **"Deploy from GitHub repo"**
4. Conecte sua conta GitHub e selecione o repositório `whatauto-bot`
5. Railway detecta automaticamente o Node.js e faz o deploy
6. Aguarde o deploy concluir (menos de 2 minutos)
7. Clique em **"Settings" → "Networking" → "Generate Domain"**
8. Copie a URL gerada (ex: `https://whatauto-bot-production.up.railway.app`)

---

### PASSO 4 — Configurar no Whatauto

1. Abra o **Whatauto** no celular
2. Vá em **Servidor**
3. Cole a URL do Railway + `/webhook`:
   ```
   https://SEU-APP.up.railway.app/webhook
   ```
4. Clique em **Salvar**
5. Pronto! ✅

---

## 📡 Rotas disponíveis

| Rota | Método | Descrição |
|------|--------|-----------|
| `/` | GET | Verifica se o servidor está online |
| `/webhook` | POST | Recebe mensagens do Whatauto |
| `/contatos` | GET | Lista todos os contatos e etapas |
| `/avancar` | POST | Avança contato para etapa 9 (pós-análise manual) |

---

## ⚙️ Como avançar um contato para a Etapa 9 (após análise)

Após receber o comprovante e fazer a análise real do CPF, envie este comando:

```
POST https://SEU-APP.up.railway.app/avancar
Content-Type: application/json

{
  "telefone": "5511999990001"
}
```

Você pode usar o app **Postman** (gratuito) ou qualquer cliente HTTP para isso.

---

## 💬 Fluxo das 11 etapas

| Etapa | Nome | Automático? |
|-------|------|-------------|
| 1 | Abertura | ✅ Sim |
| 2 | Contexto | ✅ Sim |
| 3 | Qualificação | ✅ Sim |
| 4 | Posicionamento | ✅ Sim |
| 5 | Oferta Diagnóstico | ✅ Sim |
| 6 | Coleta CPF | ✅ Sim |
| 7 | Envio Pix | ✅ Sim |
| 8 | Confirmação pagamento | ✅ Sim |
| 9 | Resultado diagnóstico | ⚠️ Manual (via /avancar) |
| 10 | Oferta do serviço | ✅ Sim |
| 11 | Fechamento | ✅ Sim |
