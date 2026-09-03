# Workflow do n8n — Atendimento WhatsApp

`workflow-atendimento-whatsapp.json` é o fluxo completo descrito no guia
[docs/superpowers/guides/2026-09-03-fase2-n8n-setup.md](../docs/superpowers/guides/2026-09-03-fase2-n8n-setup.md),
pronto para importar — faltam só credenciais e chaves.

**Aviso honesto:** este JSON foi escrito manualmente com base no formato de
exportação do n8n, mas não foi testado importando num n8n real. Os nodes
"clássicos" (Webhook, IF, Postgres, Code, HTTP Request) são estáveis e devem
importar sem problema. Os nodes de IA (AI Agent, o modelo do Gemini, a tool
de Postgres) mudam com mais frequência entre versões do n8n — se algum
desses três não importar corretamente ou aparecer com erro, você
provavelmente vai precisar recriá-lo manualmente na interface (o guia
explica o que cada um faz e a query/prompt exatos para copiar).

## Como importar

1. No n8n, crie um workflow novo → menu (⋯) → **Import from File** → escolha
   `workflow-atendimento-whatsapp.json`.
2. O workflow chega **desativado** e sem credenciais — isso é esperado
   (credenciais nunca vão dentro do JSON exportado, por segurança).

## O que configurar depois de importar

1. **Credencial Postgres** — clique em cada um dos 8 nodes que mostram um
   aviso de credencial faltando (Buscar Cliente, Buscar Conversa, Upsert
   Conversa, Atualizar Conversa - Verificacao, Criar Escalonamento - Falha
   Verificacao, Buscar Processos (Tool), Criar Escalonamento - IA) e
   selecione (ou crie) a credencial Postgres apontando pro mesmo banco do
   painel.
2. **Credencial do Gemini** — no node "Google Gemini Chat Model", crie/
   selecione a credencial com a API key do Google AI Studio.
3. **URL e chave da Evolution API** — três nodes chamados "Enviar Resposta -
   ..." têm a URL e o header `apikey` com o texto `SUBSTITUA-...` — troque
   pelos valores reais da sua instância.
4. **Confira o node "Extrair e Filtrar"** contra uma execução real (mande
   uma mensagem de teste do WhatsApp e veja o payload que chegou no
   Webhook) — o formato pode variar por versão da Evolution API.
5. Ative o workflow e configure o webhook da instância da Evolution API
   apontando para a URL do node "Webhook - Evolution API" (copie a URL de
   produção mostrada no próprio node depois de ativar o workflow).

O guia completo explica o que cada node faz, node a node, incluindo por que
o `cliente_id` da tool de IA vem fixo (não é a IA que escolhe) — vale ler
antes de mexer na lógica.
