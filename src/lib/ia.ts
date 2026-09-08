import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { listProcessosDoCliente } from "./processos";

const SYSTEM_PROMPT = `Voce e um assistente de um escritorio de advocacia, respondendo no chat do site a clientes que perguntam sobre o andamento de seus processos.

Regras rigidas:
- Responda SOMENTE com base no que a ferramenta "buscar_processos" retornar. Nunca invente numero de processo, status, prazo ou qualquer informacao juridica.
- Se o cliente tiver mais de um processo, pergunte qual processo antes de responder sobre status.
- Se a pergunta nao for sobre status de processo, se a ferramenta nao retornar nada relevante, ou se o cliente pedir explicitamente para falar com um advogado, termine sua resposta com a tag [ESCALAR] em uma linha separada, seguida do motivo em poucas palavras. Nao tente adivinhar informacao juridica.
- Seja breve e educado, em portugues do Brasil.`;

// A ferramenta declarada pro modelo NAO recebe nenhum parametro que
// identifique o cliente (nem clienteId, nem cliente_id, nem nada
// parecido) - o modelo nao escolhe nem envia esse valor. Quem resolve
// de quem buscar os processos e o handler abaixo, usando o clienteId
// fechado (closure) sobre o parametro de responderComIA, nunca um
// argumento vindo da chamada de funcao da IA. Mesma disciplina do node
// "Buscar Processos (Tool)" do workflow n8n original (ver
// n8n/workflow-atendimento-whatsapp.json), que trava o cliente_id na
// expressao do node em vez de deixar a IA preenche-lo.
const buscarProcessosTool = {
  functionDeclarations: [
    {
      name: "buscar_processos",
      description:
        "Busca a lista de processos (numero, descricao, status atual e situacao) do cliente ja identificado nesta conversa. Nao recebe parametros.",
      parameters: { type: SchemaType.OBJECT, properties: {} },
    },
  ],
};

export interface RespostaIA {
  texto: string;
  precisaEscalar: boolean;
  motivoEscalonamento: string | null;
}

export function interpretarRespostaIA(textoBruto: string): RespostaIA {
  const precisaEscalar = /\[ESCALAR\]/i.test(textoBruto);
  const texto = textoBruto.replace(/\[ESCALAR\][\s\S]*/i, "").trim();
  const motivoMatch = textoBruto.match(/\[ESCALAR\]\s*(.*)/i);

  return {
    texto: texto || "Vou encaminhar sua mensagem para um advogado.",
    precisaEscalar,
    motivoEscalonamento: precisaEscalar
      ? motivoMatch?.[1]?.trim() || "fora do escopo"
      : null,
  };
}

export async function responderComIA(
  clienteId: string,
  historico: { remetente: string; texto: string }[],
  novaMensagem: string
): Promise<RespostaIA> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-lite-latest",
    systemInstruction: SYSTEM_PROMPT,
    tools: [buscarProcessosTool],
  });

  const chat = model.startChat({
    history: historico.map((m) => ({
      role: m.remetente === "cliente" ? "user" : "model",
      parts: [{ text: m.texto }],
    })),
  });

  let result = await chat.sendMessage(novaMensagem);
  const calls = result.response.functionCalls();

  if (calls && calls.length > 0) {
    // clienteId aqui vem exclusivamente do parametro fechado desta funcao
    // (resolvido no servidor a partir da sessao verificada, antes desta
    // chamada) - nunca de `calls`/argumentos da funcao retornados pela IA.
    // Mesmo que o modelo alucine um campo tipo clienteId na chamada, ele e
    // ignorado: `calls` so serve pra saber que a ferramenta foi invocada.
    const processos = await listProcessosDoCliente(clienteId);

    // Nao usamos chat.sendMessage() aqui: o SDK instalado marca qualquer
    // parte com functionResponse com role "function" (ver
    // assignRoleToPartsAndValidateSendMessageRequest em
    // node_modules/@google/generative-ai), role que a API atual do Gemini
    // rejeita com 400 pros modelos "thinking" (geracao 2.5+) - so aceita
    // vir como "user". Contornamos chamando model.generateContent()
    // diretamente com o historico do chat (que ja preserva o
    // thoughtSignature exigido no turno do functionCall, porque
    // chat.getHistory() devolve o content bruto da resposta da API, sem
    // remover campos que o SDK nao conhece) mais o functionResponse com
    // role "user".
    result = await model.generateContent({
      contents: [
        ...(await chat.getHistory()),
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: "buscar_processos",
                response: { processos },
              },
            },
          ],
        },
      ],
    });
  }

  return interpretarRespostaIA(result.response.text());
}
