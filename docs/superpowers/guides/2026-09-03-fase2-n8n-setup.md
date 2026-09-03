# Fase 2 — Guia de configuração (Evolution API + n8n + Gemini)

**Data:** 2026-09-03
**Como usar este documento:** diferente do spec e do plano da Frente A, isto
não é código — é um guia manual para você montar na interface do n8n e do
Coolify. Os nomes exatos de campo/payload podem variar um pouco conforme a
versão instalada da Evolution API/n8n; onde isso importa, marquei "confira no
seu ambiente".

Pré-requisito: a Fase 1 (Frente A) já precisa estar em produção — este guia
assume que o Postgres do painel já tem as tabelas `clientes`, `processos`,
`historico_status`, `conversas` e `escalonamentos`.

## Visão geral do que você vai montar

```
WhatsApp do cliente
       │
       ▼
Evolution API (recebe a mensagem, dispara webhook)
       │
       ▼
n8n (workflow único, com toda a lógica)
       │
       ├── Postgres (o mesmo banco do painel)
       └── Google Gemini (só para interpretar/responder, nunca para decidir
           quem é o cliente)
       │
       ▼
Evolution API (envia a resposta de volta pro WhatsApp)
```

## Passo 1 — Evolution API no Coolify

1. No Coolify, crie um novo recurso a partir do template/Docker Compose da
   Evolution API (projeto open-source: `evolution-api`). Se seu Coolify não
   tiver um template pronto, use a imagem Docker oficial
   `atendai/evolution-api` (confira a tag mais recente estável no momento).
2. Configure as variáveis de ambiente principais:
   - `AUTHENTICATION_API_KEY`: uma chave forte que você mesmo gera — vai
     usar essa chave em toda chamada à API da Evolution (inclusive do n8n).
   - `DATABASE_*` (a Evolution API também precisa de um banco próprio para
     guardar sessões/instâncias — pode ser um Postgres separado no mesmo
     Coolify, não precisa ser o banco do painel).
3. Depois de subir, acesse o painel/documentação da Evolution API (geralmente
   em `https://<seu-dominio-evolution>/manager` ou similar) e crie uma
   **instância** nova (dá o nome que quiser, ex: `escritorio`).
4. Pareie o WhatsApp: a Evolution API mostra um QR code — escaneie com o
   WhatsApp do número que você vai dedicar ao escritório (celular com o app
   aberto → Aparelhos conectados → Conectar um aparelho).
5. Configure o **webhook** da instância pra apontar pro n8n (você só vai ter
   a URL final depois do Passo 2 — pode voltar aqui pra configurar). Evento
   mínimo necessário: `MESSAGES_UPSERT` (mensagens recebidas). Confira o nome
   exato do evento na versão instalada — pode aparecer como
   `messages.upsert` ou `MESSAGES_UPSERT` dependendo da versão.

## Passo 2 — n8n no Coolify

1. Suba o n8n via template pronto do Coolify (geralmente é um clique).
   Garanta que o volume de dados é persistente (senão os workflows somem a
   cada redeploy).
2. Acesse o n8n, crie sua conta de owner.
3. Adicione uma **credencial Postgres** apontando pro mesmo banco do painel
   (mesma `DATABASE_URL`/host/porta/usuário/senha que está no `.env` do
   painel, só que configurado como credencial nativa do n8n, não uma env
   var).
4. Crie um **workflow novo**, adicione um node **Webhook** (trigger) — copie
   a URL gerada e volte no Passo 1 pra configurar como webhook da instância
   da Evolution API.

## Passo 3 — Chave da API do Gemini

1. Acesse [aistudio.google.com](https://aistudio.google.com), gere uma API
   key (tier gratuito).
2. No n8n, adicione uma credencial do tipo "Google Gemini" (ou "Google PaLM
   API", dependendo de como aparece na sua versão do n8n) com essa chave.

## Passo 4 — O workflow no n8n, node a node

Aqui está a lógica completa, na ordem. Os nomes de node abaixo são os tipos
nativos do n8n — os nomes exatos de campo dentro de cada um podem variar
levemente por versão.

### 4.1 — Webhook (trigger)

Recebe o POST da Evolution API. O payload típico de uma mensagem recebida
tem este formato (confira o formato real no seu ambiente — mande uma
mensagem de teste e olhe a execução no n8n):

```json
{
  "event": "messages.upsert",
  "instance": "escritorio",
  "data": {
    "key": { "remoteJid": "5511999999999@s.whatsapp.net", "fromMe": false },
    "message": { "conversation": "oi, como está meu processo?" },
    "messageTimestamp": 1234567890
  }
}
```

### 4.2 — IF: ignorar mensagens próprias e não-texto

Antes de qualquer coisa, filtre: `data.key.fromMe` precisa ser `false`
(senão o bot fica respondendo pra si mesmo) e `data.message.conversation` (ou
`data.message.extendedTextMessage.text`, pra mensagens de resposta/citação)
precisa existir. Se não passar, **encerra o workflow sem fazer nada**.

### 4.3 — Function/Set: normalizar telefone e extrair texto

```js
const telefone = "+" + $json.data.key.remoteJid.split("@")[0];
const texto =
  $json.data.message.conversation ??
  $json.data.message.extendedTextMessage?.text ??
  "";
return { telefone, texto };
```

`telefone` precisa ficar exatamente no mesmo formato E.164 que está
cadastrado em `clientes.telefone` (com `+`) — se os números que a Evolution
API manda vierem diferentes disso (ex: com um `9` a mais/a menos, comum em
números de celular brasileiro dependendo da versão do WhatsApp), você vai
precisar ajustar essa normalização depois de testar com um número real.

### 4.4 — Postgres: buscar cliente pelo telefone

```sql
SELECT id, nome, cpf, advogado_id
FROM clientes
WHERE telefone = '{{ $json.telefone }}'
```

### 4.5 — IF: cliente encontrado?

- **Não** → node de resposta (Evolution API, ver 4.9) com mensagem tipo "Não
  encontramos seu cadastro em nosso sistema. Entre em contato com o
  escritório." → **fim do workflow**.
- **Sim** → segue.

### 4.6 — Postgres: buscar/criar `Conversa` e checar sessão

Primeiro, busca:

```sql
SELECT * FROM conversas WHERE telefone = '{{ $json.telefone }}'
```

Em um node de código (Function), calcule se a sessão está válida **usando o
valor antigo de `ultima_mensagem_em`, antes de atualizar**:

```js
const conversa = $json; // resultado da query acima, ou null se não existir
const agora = new Date();
const sessaoValida =
  conversa &&
  conversa.verificado_em &&
  agora - new Date(conversa.ultima_mensagem_em) < 24 * 60 * 60 * 1000;

return { sessaoValida, conversaExiste: !!conversa };
```

Depois, faça um **upsert** em `conversas` (Postgres node, modo "Upsert" ou um
`INSERT ... ON CONFLICT (telefone) DO UPDATE`) atualizando
`ultima_mensagem_em = agora` — isso sempre acontece, independente do
resultado da verificação.

### 4.7 — IF: sessão válida?

- **Não** → siga para o **ramo de verificação de identidade** (4.7a).
- **Sim** → siga direto para o **ramo da IA** (4.8).

**4.7a — Ramo de verificação:** compare o texto recebido com os últimos 4
dígitos do `cpf` do cliente (já vieram da query 4.4):

```js
const digitosRecebidos = $json.texto.replace(/\D/g, "").slice(-4);
const digitosEsperados = $json.cpf.slice(-4);
const confirmou = digitosRecebidos === digitosEsperados && digitosRecebidos.length === 4;
```

- **Confirmou** → Postgres: `UPDATE conversas SET verificado_em = now(),
  tentativas_falhas = 0 WHERE telefone = '...'`. Responde "Identidade
  confirmada! Pode repetir sua pergunta." → **fim do workflow** (o cliente
  manda a pergunta de novo na próxima mensagem, que aí sim cai no ramo da
  IA).
- **Não confirmou** → Postgres: `UPDATE conversas SET tentativas_falhas =
  tentativas_falhas + 1 WHERE telefone = '...'`.
  - Se `tentativas_falhas` (depois de incrementar) `< 3` → responde pedindo
    os 4 últimos dígitos do CPF de novo.
  - Se `>= 3` → cria um `Escalonamento` (motivo: `"falha na verificação"`,
    ver 4.10) e responde "Não conseguimos confirmar sua identidade. Um
    advogado vai entrar em contato."

  **Se `conversaExiste` era `false`** (primeira mensagem desse telefone),
  ignore a comparação acima nesta primeira passada e vá direto para pedir a
  confirmação de CPF pela primeira vez, sem incrementar tentativa.

### 4.8 — Ramo da IA: AI Agent (Gemini) + tool de consulta

Node **AI Agent** do n8n, modelo = credencial do Gemini criada no Passo 3.

**Prompt de sistema** (cole isso no campo de system prompt do AI Agent):

```
Você é um assistente de um escritório de advocacia, respondendo pelo
WhatsApp a clientes que perguntam sobre o andamento de seus processos.

Regras rígidas:
- Responda SOMENTE com base no que a ferramenta "buscar_processos"
  retornar. Nunca invente número de processo, status, prazo ou qualquer
  informação jurídica.
- Se o cliente tiver mais de um processo, pergunte qual processo antes de
  responder sobre status.
- Se a pergunta não for sobre status de processo, se a ferramenta não
  retornar nada relevante, ou se o cliente pedir explicitamente para falar
  com um advogado, responda educadamente que vai encaminhar para um
  advogado e pare — não tente adivinhar.
- Seja breve e educado, em português do Brasil.
```

**Tool: `buscar_processos`** — adicione um node de **Postgres Tool** (ou
"Postgres" configurado como tool, dependendo da versão do n8n) conectado ao
AI Agent, com esta query:

```sql
SELECT numero_processo, descricao, status_atual, situacao
FROM processos
WHERE cliente_id = '{{ $('Buscar cliente').item.json.id }}'
```

**Isso é o ponto de segurança mais importante do workflow**: o
`cliente_id` **não** vem de um parâmetro que a IA preenche — vem de uma
expressão fixa referenciando o node que já buscou o cliente pelo telefone
(passo 4.4), lá atrás no fluxo, antes mesmo da IA ser chamada. A IA nunca
vê nem escolhe esse valor. Configure o parâmetro da tool como fixo
("Fixed"/expressão), não como "Let the model fill it out" — se o seu n8n
oferecer as duas opções para os parâmetros da tool, use sempre a fixa aqui.

Depois do AI Agent responder, um node de código decide se a resposta indica
necessidade de escalonamento (ex: você pode pedir pro próprio prompt
terminar a resposta com uma tag interna tipo `[ESCALAR]` quando decidir
escalar, e checar essa tag num Function node antes de mandar a mensagem final
pro cliente — remova a tag da mensagem antes de enviar). Isso é mais simples
de manter do que tentar decidir por fora se a resposta "parece" uma
escalação.

### 4.9 — Enviar a resposta (Evolution API)

Node **HTTP Request** chamando o endpoint de envio de mensagem da Evolution
API (`POST /message/sendText/<instancia>`, com o header da
`AUTHENTICATION_API_KEY`), corpo:

```json
{
  "number": "{{ $json.telefone.replace('+', '') }}",
  "text": "{{ $json.respostaFinal }}"
}
```

(Confira o path exato do endpoint na documentação da versão instalada — o
formato acima é o padrão comum da Evolution API, mas endpoints mudam entre
versões.)

### 4.10 — Criar um Escalonamento

Sempre que o fluxo decidir escalar (falha de verificação 3x, pergunta fora
do escopo, pedido explícito de humano, dado não encontrado), Postgres
Insert:

```sql
INSERT INTO escalonamentos (id, cliente_id, advogado_id, telefone, mensagem_cliente, motivo, criado_em)
VALUES (
  gen_random_uuid(),
  '{{ $('Buscar cliente').item.json.id }}',
  '{{ $('Buscar cliente').item.json.advogado_id }}',
  '{{ $json.telefone }}',
  '{{ $json.texto }}',
  '{{ $json.motivo }}',
  now()
)
```

Repare que `advogado_id` vem do **mesmo resultado da busca do cliente**
(`cliente.advogado_id`), não de um valor separado — isso garante que o
escalonamento sempre aponta pro advogado dono daquele cliente, que é
exatamente a garantia que o painel depende para isolar advogados entre si.

## Passo 5 — Testar

1. Ative o workflow no n8n.
2. Mande uma mensagem de um número **não cadastrado** — confirme a resposta
   de "não encontramos seu cadastro".
3. Cadastre esse número como cliente no painel (Fase 1).
4. Mande mensagem de novo — confirme que pede confirmação de CPF.
5. Responda com os últimos 4 dígitos errados 3 vezes — confirme que aparece
   um item novo em "Atendimentos pendentes" no painel, logado como o
   advogado dono daquele cliente.
6. Cadastre um processo pra esse cliente no painel. Repita o fluxo, agora
   confirmando o CPF certo, e pergunte "como está meu processo" — confirme
   que a resposta reflete o status real cadastrado.

## Limitações conhecidas desta primeira versão

- Depois de 3 tentativas erradas de CPF, o cliente fica "preso": mensagens
  seguintes vão continuar pedindo confirmação (já que `verificado_em`
  continua nulo) até que alguém resete manualmente `tentativas_falhas` no
  banco. Não há uma tela no painel para isso ainda — se isso incomodar na
  prática, é um ajuste pequeno de adicionar depois (ex: resetar
  automaticamente após um tempo, ou dar essa opção no painel).
- Se o cliente tiver mais de um processo e a IA perguntar qual, a resposta
  do cliente para "qual processo" também vai passar pela IA de novo — isso
  funciona bem na maioria dos casos mas não foi pensado como uma máquina de
  estados rígida feito a verificação de CPF (que é código puro, não IA).
- Payloads exatos da Evolution API e nomes de endpoint podem ter mudado
  desde que este guia foi escrito — trate os JSONs acima como o formato
  esperado, não como garantia, e ajuste conforme o que você vir nas
  execuções reais do n8n.
