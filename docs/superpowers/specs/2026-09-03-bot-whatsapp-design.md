# Fase 2 — Bot de WhatsApp + IA

**Data:** 2026-09-03
**Status:** Aprovado para implementação

## Contexto

A Fase 1 (painel do advogado) está em produção: advogados cadastram
clientes, processos e mantêm um histórico de status. Essa é a base de
dados que este documento consome. A Fase 2 conecta um número de WhatsApp
do escritório a essa base: quando um cliente manda mensagem perguntando
sobre o processo, um bot identifica quem ele é, entende a pergunta,
consulta os dados já cadastrados e responde — ou encaminha pro advogado
quando não consegue.

Não existe hoje conexão nenhuma com WhatsApp. O número do escritório
ainda precisa ser providenciado (chip próprio ou virtual) e pareado via
QR code quando esta fase for implementada — isso é um passo operacional,
não faz parte do desenho técnico abaixo.

## Objetivo

Um cliente manda mensagem no WhatsApp do escritório perguntando sobre seu
processo. O sistema identifica o cliente pelo telefone (com uma
confirmação de segurança), entende a pergunta usando IA, busca a resposta
nos dados cadastrados na Fase 1, e responde automaticamente. Quando não
consegue responder com segurança, avisa o cliente que vai encaminhar e
cria um item pendente para o advogado responsável ver no painel.

## Fora de escopo

- Agendar reuniões, receber documentos, ou qualquer capacidade além de
  "consultar status do processo".
- Qualquer alteração de dados pelo WhatsApp (só leitura — quem edita
  processo/status continua sendo o advogado no painel).
- Multi-idioma (só português).
- Métricas/dashboard de uso do bot.

## Arquitetura

Três peças novas, hospedadas no Coolify do usuário, ao lado do painel
(Fase 1) já existente:

- **Evolution API** — gateway de WhatsApp self-hosted (baseado no
  Baileys), conectado ao número do escritório via QR code. Recebe
  mensagens via webhook, envia mensagens via chamada REST.
- **n8n** — orquestra toda a lógica de negócio: recebe o webhook da
  Evolution API, decide o que fazer (verificar identidade, chamar a IA,
  responder, escalar), grava no banco.
- **Google Gemini** (free tier) — chamado pelo node de AI Agent do n8n
  (com tool-calling) só na etapa de interpretar a pergunta e formular a
  resposta a partir dos dados já buscados. A IA **não** participa da
  verificação de identidade nem tem acesso a SQL livre (ver "Segurança da
  IA" abaixo).

Tudo lê e escreve no **mesmo banco Postgres** da Fase 1 — o n8n acessa via
node de Postgres nativo, não existe (nem é necessário) uma API HTTP
própria para isso.

## Modelo de dados (adições ao schema existente)

```
Conversa
  id                 uuid, pk
  telefone           string, único (E.164, mesmo formato de Cliente.telefone)
  verificado_em      timestamp, nullable
  tentativas_falhas  int, default 0
  ultima_mensagem_em timestamp
  criado_em          timestamp

Escalonamento
  id                 uuid, pk
  cliente_id         fk -> Cliente (o fluxo abaixo só cria um
                      escalonamento depois de já ter identificado o
                      cliente pelo telefone — nunca fica nulo na prática,
                      por isso não é nullable)
  advogado_id        fk -> Advogado (responsável, derivado de cliente.advogado_id)
  telefone           string
  mensagem_cliente   string
  motivo             string, nullable (ex: "fora do escopo", "falha na verificação", "pedido de humano")
  criado_em          timestamp
  resolvido_em       timestamp, nullable (null = pendente)
```

`Conversa` é uma tabela técnica (estado de sessão), sem tela própria no
painel. `Escalonamento` alimenta a nova tela "Atendimentos pendentes".

## Fluxo da conversa

1. **Mensagem chega** → n8n recebe o webhook da Evolution API com
   `{telefone, texto}`.
2. **Identificar o cliente**: busca `Cliente` pelo `telefone` (E.164,
   igual ao que já é validado na Fase 1). Não encontrou → responde que
   não localizou o cadastro e **não cria escalonamento** (evita lotar a
   fila com números errados ou spam).
3. **Verificar sessão**: busca `Conversa` pelo telefone.
   - Não existe, ou `verificado_em` é nulo, ou já se passaram mais de 24h
     desde `ultima_mensagem_em` → sessão expirada. Pede confirmação: os
     últimos dígitos do CPF do cliente.
   - Cliente responde: compara com `Cliente.cpf` (armazenado só dígitos,
     conforme a Fase 1). Bateu → grava `verificado_em = agora`, zera
     `tentativas_falhas`, segue para o passo 4. Não bateu → incrementa
     `tentativas_falhas`; ao chegar a 3, cria `Escalonamento` (motivo:
     "falha na verificação") e avisa que um advogado vai entrar em
     contato, sem mais tentativas.
   - Sessão já verificada e dentro da janela de 24h → segue direto pro
     passo 4.
   - Em qualquer mensagem recebida, `ultima_mensagem_em` é atualizada
     para agora (isso reinicia a contagem da janela de 24h).
4. **Interpretar e responder** (aqui entra a IA): o AI Agent do n8n
   recebe a pergunta do cliente e uma ferramenta (`buscar_processos`) que
   já vem travada no `cliente_id` da conversa verificada — a IA nunca
   escolhe de quem buscar, só formula a resposta a partir do que a
   ferramenta retorna.
   - Cliente com 1 processo ativo → a IA já responde sobre esse.
   - Cliente com mais de um → a IA pergunta qual processo antes de
     responder.
   - Pergunta fora do escopo (não é sobre status de processo), dado que
     a ferramenta não encontrou, ou pedido explícito de falar com humano
     → cria `Escalonamento` (motivo correspondente) e avisa que um
     advogado vai retornar.

## Segurança da IA

Regra dura, não negociável dado que são dados de processos jurídicos:

- A IA **nunca** tem acesso a SQL livre nem a uma ferramenta genérica de
  "consultar banco". A única ferramenta disponível a ela
  (`buscar_processos`) já vem parametrizada pelo `cliente_id` resolvido
  deterministicamente pelo n8n antes de a IA ser chamada — a IA não
  recebe nem pode alterar esse parâmetro.
- A verificação de identidade (passo 3 do fluxo) é lógica determinística
  do n8n (nodes de IF/Postgres), **não** passa pela IA em nenhum momento.
  Isso significa que um "jailbreak" de prompt não tem como pular a
  verificação — a etapa nem está no caminho que a IA controla.
- O prompt do AI Agent instrui explicitamente a nunca inventar
  informação que não veio da ferramenta, e a escalar em vez de
  adivinhar quando a ferramenta não retornar o que foi perguntado.

## Mudanças na Fase 1 (painel)

Duas adições ao código já existente, seguindo os mesmos padrões (camada
de serviço com escopo por `advogado_id`, tela server-rendered):

- `src/lib/escalonamentos.ts`: `listEscalonamentosPendentes(advogadoId)`,
  `resolverEscalonamento(advogadoId, escalonamentoId)`.
- Tela nova em `/atendimentos`: lista os escalonamentos pendentes do
  advogado logado (telefone, mensagem do cliente, motivo, quando), com
  botão para marcar como resolvido.

## Como isso vai ser construído

Duas frentes distintas, porque o n8n é uma ferramenta visual — não dá
para "implementar" um workflow dele com TDD/subagentes do jeito que a
Fase 1 foi construída:

- **Frente A — código no repositório Next.js**: as duas tabelas novas
  (migration Prisma) e a tela `/atendimentos`. Isso segue exatamente o
  mesmo processo da Fase 1 — plano de implementação detalhado, execução
  via subagentes, testes contra Postgres real.
- **Frente B — guia de configuração do n8n/Evolution API/Gemini**: um
  documento passo a passo (nodes exatos, expressões, prompt do AI Agent)
  para montar o workflow manualmente na interface do n8n. Não passa pelo
  processo de plano+subagentes — é executado manualmente pelo usuário
  (ou por mim, se houver acesso programático ao n8n no futuro).

## Testes (Frente A)

Mesma prioridade de sempre: isolamento entre advogados (um advogado não
vê escalonamento de cliente de outro) e a lógica de
`resolverEscalonamento` (marca `resolvido_em`, rejeita se o
escalonamento pertence a outro advogado).

## Próximos passos

Depois que a Frente A estiver implementada e revisada, escrevo o guia da
Frente B em cima da estrutura de dados já existente.
