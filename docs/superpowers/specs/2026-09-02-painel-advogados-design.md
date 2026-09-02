# Fase 1 — Painel do Advogado + Banco de Dados

**Data:** 2026-09-02
**Status:** Aprovado para implementação

## Contexto

O escritório recebe muitas mensagens de clientes no WhatsApp perguntando sobre
o status de seus processos. O objetivo final é ter um bot de IA que responde
essas perguntas automaticamente (Fase 2). Para isso existir, primeiro precisa
existir uma base de dados estruturada com clientes, processos e histórico de
status — e um painel onde os advogados mantêm essa base atualizada. Essa é a
Fase 1, descrita neste documento.

Hoje não existe nenhum sistema de gestão de processos no escritório (as
informações ficam soltas). Este painel é a fonte de verdade que a Fase 2 vai
consultar.

## Objetivo

Advogados individuais fazem login num painel web e cadastram/mantêm seus
próprios clientes e processos, incluindo um histórico de atualizações de
status. Um admin cadastra as contas dos advogados.

## Fora de escopo (Fase 2, não construir agora)

- Conexão com WhatsApp (Evolution API), orquestração (n8n), IA.
- Tela de "solicitações escaladas" / atendimentos pendentes que a IA vai
  gerar quando não conseguir responder um cliente.
- Confirmação de identidade do cliente via CPF durante a conversa no
  WhatsApp.

O modelo de dados abaixo já reserva os campos que a Fase 2 vai precisar
(telefone único do cliente, CPF) para não exigir migração destrutiva depois.

## Arquitetura

- **Next.js** (App Router, TypeScript) — cobre UI e API routes num só
  projeto.
- **PostgreSQL**, self-hosted via Coolify (mesma VPS que já hospeda o
  Coolify do usuário).
- **Prisma** como ORM e para migrations.
- **Auth.js (NextAuth)**, provider de credenciais (e-mail + senha), hash de
  senha com bcrypt, sessão via cookie/JWT.
- **Deploy**: repositório git → build/deploy automático via Coolify
  (Nixpacks ou Dockerfile).

## Modelo de dados

```
Advogado
  id            uuid, pk
  nome          string
  email         string, único
  senha_hash    string
  is_admin      boolean, default false
  criado_em     timestamp

Cliente
  id            uuid, pk
  advogado_id   fk -> Advogado (dono)
  nome          string
  telefone      string, formato E.164, ÚNICO na tabela inteira
  cpf           string (11 dígitos)
  criado_em     timestamp

Processo
  id              uuid, pk
  cliente_id      fk -> Cliente
  advogado_id     fk -> Advogado (responsável)
  numero_processo string
  descricao       string
  status_atual    string
  situacao        enum (ativo, encerrado), default ativo
  criado_em       timestamp
  atualizado_em   timestamp

HistoricoStatus
  id            uuid, pk
  processo_id   fk -> Processo
  texto         string
  criado_em     timestamp
```

Decisões relevantes:

- `Cliente.telefone` é único **globalmente**, não só por advogado. A Fase 2
  vai identificar o cliente que manda mensagem pelo número de telefone, sem
  saber de antemão a qual advogado ele pertence — por isso a busca precisa
  ser determinística num único registro.
- `HistoricoStatus` é **append-only**: a API não expõe edição ou exclusão de
  entradas, só criação. É o registro confiável da linha do tempo do
  processo.
- `Processo` não é excluído fisicamente — vira `situacao = encerrado`. Isso
  preserva o histórico para consulta futura (inclusive pela IA na Fase 2).

## Papéis e permissões

Dois papéis, ambos representados na tabela `Advogado`:

- **admin** (`is_admin = true`): acessa a tela de gerenciar contas de
  advogados (criar, editar, desativar). Não enxerga a carteira de clientes
  de outros advogados por padrão — a permissão de admin é só sobre contas,
  não sobre dados de clientes.
- **advogado**: gerencia exclusivamente seus próprios clientes e processos.

Toda query de `Cliente` e `Processo` (leitura, escrita, exclusão) é
filtrada por `advogado_id = id do usuário autenticado` na camada de API —
inclusive contra acesso direto por URL/ID de um registro de outro
advogado (deve retornar 404, não 403, para não revelar que o registro
existe).

A primeira conta admin é criada por um script de seed rodado no deploy
inicial (não há cadastro público).

## Telas

1. **Login** — e-mail + senha.
2. **Lista de clientes** — clientes do advogado logado, busca por nome.
3. **Cadastro/edição de cliente** — nome, telefone, CPF.
4. **Detalhe do cliente** — dados do cliente + lista de processos
   vinculados.
5. **Cadastro/edição de processo** — número, descrição, situação; dentro do
   detalhe do processo, formulário para adicionar nova entrada no
   histórico de status (isso atualiza `status_atual` e cria uma linha em
   `HistoricoStatus`).
6. **Gerenciar advogados** (somente admin) — criar conta (nome, e-mail,
   senha inicial), ativar/desativar.

## Validações e tratamento de erros

- `Cliente.telefone`: obrigatório, validado em formato E.164; se já
  existir outro cliente com o mesmo telefone, erro claro orientando a
  verificar se o cliente já está cadastrado (evita duplicar o mesmo
  cliente sob dois advogados).
- `Cliente.cpf`: validado por dígito verificador (formato, não checagem de
  existência real).
- `Cliente.nome` e `Cliente.telefone`: obrigatórios para salvar.
- Acesso a um `Cliente`/`Processo` que não pertence ao usuário logado:
  404.
- Tentativa de editar/excluir uma entrada de `HistoricoStatus`: rota não
  existe (a API nem expõe essa operação).

## Testes

Prioridade nos pontos que importam de verdade neste sistema:

- **Isolamento entre advogados**: testes de integração garantindo que um
  advogado não consegue ler, editar ou excluir cliente/processo de outro
  advogado, mesmo manipulando o ID diretamente na URL/request.
- **Validações de cadastro**: telefone único (rejeita duplicata), CPF com
  dígito verificador inválido é rejeitado.
- **Histórico append-only**: confirma que não há rota de edição/exclusão
  de `HistoricoStatus`, e que criar uma entrada atualiza `status_atual` do
  processo corretamente.
- Smoke test de login (credenciais corretas entram, incorretas não).

## Próximos passos

Após esta fase estar implementada e em uso, faremos o brainstorm da Fase 2
(Evolution API + n8n + IA) em cima dos dados já existentes neste painel.
