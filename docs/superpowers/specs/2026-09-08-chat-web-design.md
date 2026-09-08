# Fase 2 (revisão) — Chat Web como canal de atendimento

**Data:** 2026-09-08
**Status:** Aprovado para implementação

## Contexto

A Fase 2 original previa um bot de WhatsApp (Evolution API + n8n). Em
produção, o envio automático de mensagens pela Evolution API (conexão
não-oficial via Baileys) ficou preso em "PENDING" indefinidamente — a
mensagem nunca é confirmada pelo servidor do WhatsApp, mesmo com a
instância "Connected" e reconectada do zero. O padrão se repetiu em dois
contatos diferentes, descartando causas pontuais (contato específico,
sessão dessincronizada). Mensagens recebidas (cliente → bot) sempre
funcionaram; só o envio automático (bot → cliente) falha.

Diante disso, o canal de entrega muda: em vez de WhatsApp, o cliente usa
uma página de chat dentro do próprio painel. Isso elimina a dependência do
WhatsApp não-oficial (e o risco de bloqueio que vem junto) sem descartar
o trabalho já feito — toda a lógica de negócio (identificar cliente,
confirmar identidade, IA restrita por ferramenta, escalonamento) é a
mesma, só muda o transporte.

Evolution API e n8n continuam implantados no Coolify, mas saem de uso
ativo por enquanto. Migrar para a API oficial do WhatsApp (Meta Cloud
API) fica como opção futura, fora do escopo deste documento.

## Objetivo

Um cliente acessa uma URL do escritório, informa seu telefone, confirma
os últimos 4 dígitos do CPF, e a partir daí conversa livremente com um
assistente de IA que responde com base nos processos cadastrados dele —
numa interface de chat com histórico visível (bolhas de mensagem), sem
precisar se identificar de novo por 24h (sessão via cookie).

## Fora de escopo

- Qualquer alteração de dados pelo chat (só leitura, igual à Fase 2
  original).
- Migração para WhatsApp oficial (Meta Cloud API) — fica para depois.
- Desativar/remover Evolution API e n8n — ficam implantados, só não são
  usados por este fluxo.

## Arquitetura

Uma rota pública nova (`/atendimento`) dentro do mesmo app Next.js do
painel — **sem** login de advogado, mas também sem depender de n8n ou
Evolution API. A página fala direto com:
- **Postgres** (mesmo banco do painel) — via Server Actions, reaproveitando
  o padrão de camada de serviço já usado no resto do app.
- **Google Gemini** — chamado diretamente pela API do Node
  (`@google/generative-ai`), com function-calling, no lugar do node "AI
  Agent" do n8n.
- **Cloudflare Turnstile** — captcha invisível gratuito, validado no
  passo de identificação por telefone, para impedir tentativa automatizada
  em massa.

## Modelo de dados

Duas mudanças sobre o que já existe (`Conversa`, `Escalonamento` — sem
alteração de propósito, só um campo novo em `Conversa`):

```
Conversa (existente + 1 campo novo)
  ...campos existentes (telefone, verificado_em, tentativas_falhas,
     ultima_mensagem_em, criado_em)...
  session_token      string, único, nullable — gerado na confirmação de
                      CPF, guardado num cookie httpOnly no navegador do
                      cliente

MensagemChat (nova)
  id           uuid, pk
  conversa_id  fk -> Conversa
  remetente    enum (cliente, bot)
  texto        string
  criado_em    timestamp
```

`MensagemChat` é o que permite a tela mostrar o histórico da conversa
como bolhas, e também dá contexto de múltiplas mensagens pra IA responder
com continuidade (ex: "qual processo?" → cliente responde → IA já sabe
do que estão falando).

## Fluxo de identificação

1. Cliente acessa `/atendimento`.
2. Se já existe um cookie de sessão válido (bate com um
   `Conversa.session_token`, e `verificado_em` está a menos de 24h) → vai
   direto pro chat.
3. Senão, mostra formulário: telefone + widget do Turnstile.
4. Ao enviar: valida o token do Turnstile no servidor; busca `Cliente`
   pelo telefone (formato E.164 — como é digitado pelo próprio cliente,
   não vem de um JID do WhatsApp, não precisa da lógica de variante do
   9º dígito que o fluxo do WhatsApp precisava).
   - Não encontrado → mensagem genérica ("não encontramos seu cadastro"),
     sem criar `Escalonamento` (mesmo motivo da Fase 2 original: evita
     lotar a fila com tentativa errada/número digitado errado).
   - Encontrado → mostra passo de confirmar os últimos 4 dígitos do CPF.
5. CPF confere → gera `session_token` (string aleatória), grava em
   `Conversa` (`verificado_em = agora`, `tentativas_falhas = 0`), seta
   cookie httpOnly com esse token, redireciona pro chat.
6. CPF não confere → incrementa `tentativas_falhas`; com 3 erros, cria
   `Escalonamento` (motivo: "falha na verificação") e bloqueia novas
   tentativas nessa sessão, mostrando que um advogado vai entrar em
   contato.

## Fluxo do chat

1. Tela mostra o histórico (`MensagemChat` da `Conversa` da sessão,
   mais recente embaixo) + campo de texto.
2. Cliente manda mensagem → Server Action: grava como `MensagemChat`
   (remetente `cliente`); chama o Gemini com function-calling, passando
   as últimas mensagens como contexto e uma ferramenta `buscarProcessos`
   travada no `cliente_id` já resolvido na verificação (a IA nunca recebe
   nem escolhe esse valor — mesma regra da Fase 2 original); grava a
   resposta como `MensagemChat` (remetente `bot`); se a IA sinalizar
   necessidade de escalonamento (pergunta fora do escopo, pedido de
   humano, dado não encontrado), cria `Escalonamento`.
3. Tela atualiza mostrando a nova troca.

Todo `Escalonamento` criado (aqui ou no passo de verificação) usa
`advogado_id` vindo do `Cliente` resolvido na identificação (mesma regra
da Fase 2 original: sempre o advogado dono daquele cliente, nunca um
valor separado).

## Segurança

- **A IA nunca recebe SQL livre nem escolhe de quem buscar dado** — regra
  idêntica à da Fase 2 original, só que agora implementada como uma
  função JavaScript chamada pelo SDK do Gemini (function-calling) em vez
  de um node de tool do n8n.
- **Diferença real em relação ao WhatsApp:** no WhatsApp, o número vem da
  sessão real do aparelho; aqui, qualquer pessoa pode digitar qualquer
  telefone. A barreira de segurança real passa a ser inteiramente o CPF
  (4 dígitos, 3 tentativas antes de bloquear) — mais fraca que antes,
  aceita conscientemente como troca pela simplicidade e confiabilidade do
  canal.
- **Turnstile** cobre o risco complementar (tentativa automatizada em
  massa, não humano tentando adivinhar um CPF específico).
- Cookie de sessão: httpOnly, valor aleatório não previsível (não é o
  telefone nem um id sequencial).

## Visual

Reaproveita a identidade visual já construída pro painel (papel/tinta/
latão, tipografia Lora + IBM Plex Sans) — não uma cópia do WhatsApp.
Bolhas de mensagem: cliente à direita, bot à esquerda (ou cores opostas),
com a paleta já definida.

## Testes

Mesma prioridade de sempre nas partes que são lógica pura (Server
Actions/serviço, testável contra Postgres real): emissão e validação do
`session_token`, bloqueio após 3 tentativas de CPF, e que a ferramenta de
busca de processos nunca aceita um `cliente_id` vindo de fora da sessão
verificada. Chamadas reais ao Gemini não entram nos testes automatizados
(sem mock de IA nesta fase) — verificação da IA é manual.

## Próximos passos

Se a confiabilidade do chat web se provar boa na prática, WhatsApp oficial
(Meta Cloud API) continua como opção pra reintroduzir esse canal depois,
reaproveitando toda a lógica de negócio já construída (ela já está
desenhada pra ser independente do transporte).
