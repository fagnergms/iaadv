import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db";
import { resetDb, makeAdvogado } from "./testHelpers";
import { createCliente } from "./clientes";
import {
  buscarClientePorTelefone,
  confirmarCpf,
  obterConversaValida,
} from "./atendimento";

const clienteInput = {
  nome: "Maria Silva",
  telefone: "+5511999990000",
  cpf: "111.444.777-35",
};

describe("atendimento service", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("busca cliente pelo telefone", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);

    const encontrado = await buscarClientePorTelefone(clienteInput.telefone);
    expect(encontrado?.id).toBe(cliente.id);
    expect(encontrado?.advogadoId).toBe(advogado.id);

    expect(await buscarClientePorTelefone("+5511999999999")).toBeNull();
  });

  it("confirmarCpf retorna cliente_nao_encontrado pra telefone nao cadastrado", async () => {
    const resultado = await confirmarCpf("+5511999999999", "7735");
    expect(resultado.status).toBe("cliente_nao_encontrado");
  });

  it("confirmarCpf confirma com os ultimos 4 digitos corretos e gera sessionToken", async () => {
    const advogado = await makeAdvogado();
    await createCliente(advogado.id, clienteInput);

    const resultado = await confirmarCpf(clienteInput.telefone, "7735");
    expect(resultado.status).toBe("confirmado");
    if (resultado.status === "confirmado") {
      expect(resultado.sessionToken).toHaveLength(64);

      const sessao = await obterConversaValida(resultado.sessionToken);
      expect(sessao?.cliente.id).toBe(resultado.clienteId);
    }
  });

  it("confirmarCpf rejeita digitos errados e conta tentativas", async () => {
    const advogado = await makeAdvogado();
    await createCliente(advogado.id, clienteInput);

    const r1 = await confirmarCpf(clienteInput.telefone, "0000");
    expect(r1).toEqual({ status: "cpf_invalido", tentativasRestantes: 2 });

    const r2 = await confirmarCpf(clienteInput.telefone, "0000");
    expect(r2).toEqual({ status: "cpf_invalido", tentativasRestantes: 1 });
  });

  it("bloqueia e cria escalonamento apos 3 tentativas erradas", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);

    await confirmarCpf(clienteInput.telefone, "0000");
    await confirmarCpf(clienteInput.telefone, "0000");
    const r3 = await confirmarCpf(clienteInput.telefone, "0000");
    expect(r3.status).toBe("bloqueado");

    const r4 = await confirmarCpf(clienteInput.telefone, "7735");
    expect(r4.status).toBe("bloqueado");

    const escalonamentos = await prisma.escalonamento.findMany({
      where: { clienteId: cliente.id },
    });
    expect(escalonamentos).toHaveLength(1);
    expect(escalonamentos[0].motivo).toBe("falha na verificação");
  });

  it("obterConversaValida retorna null pra token inexistente ou sessao expirada", async () => {
    expect(await obterConversaValida("token-que-nao-existe")).toBeNull();

    const advogado = await makeAdvogado();
    await createCliente(advogado.id, clienteInput);
    const confirmado = await confirmarCpf(clienteInput.telefone, "7735");
    if (confirmado.status !== "confirmado") throw new Error("setup falhou");

    await prisma.conversa.update({
      where: { telefone: clienteInput.telefone },
      data: { verificadoEm: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });

    expect(await obterConversaValida(confirmado.sessionToken)).toBeNull();
  });

  it("nao permite mais de 3 tentativas efetivas mesmo com falhas concorrentes (race no contador)", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);

    // Dispara 5 tentativas erradas em paralelo, simulando requisições concorrentes
    // (ex.: um atacante script automatizando múltiplas abas). Um contador
    // read-then-write ingênuo permitiria "perder" incrementos e conceder mais
    // tentativas do que o limite de 3.
    const resultados = await Promise.all(
      Array.from({ length: 5 }, () => confirmarCpf(clienteInput.telefone, "0000"))
    );

    const bloqueados = resultados.filter((r) => r.status === "bloqueado");
    const invalidos = resultados.filter((r) => r.status === "cpf_invalido");
    // Com incremento atômico, cada tentativa que efetivamente consome o
    // contador recebe um valor sequencial único (1, 2, 3, ...) — nunca duas
    // requisições concorrentes "colidem" no mesmo valor. Logo, exatamente as
    // 2 tentativas que pegam os valores 1 e 2 veem cpf_invalido, e as demais
    // (a que cruza o limite em 3, mais qualquer uma que já leia o estado
    // bloqueado) veem bloqueado — sempre 2 e 3, com qualquer ordem de
    // execução das 5 chamadas concorrentes.
    expect(invalidos.length).toBe(2);
    expect(bloqueados.length).toBe(3);

    const conversa = await prisma.conversa.findUnique({
      where: { telefone: clienteInput.telefone },
    });
    // O contador nunca "perde" incrementos por causa de uma corrida: ele é
    // sempre >= 3 (o suficiente pra ter disparado o bloqueio) e <= 5 (não
    // pode passar do número de tentativas reais feitas).
    expect(conversa?.tentativasFalhas).toBeGreaterThanOrEqual(3);
    expect(conversa?.tentativasFalhas).toBeLessThanOrEqual(5);

    // Mesmo com 5 tentativas concorrentes cruzando o limite, exatamente um
    // escalonamento deve ser criado (sem duplicar no ponto de corte).
    const escalonamentos = await prisma.escalonamento.findMany({
      where: { clienteId: cliente.id },
    });
    expect(escalonamentos).toHaveLength(1);

    // Uma tentativa correta após o bloqueio concorrente continua bloqueada.
    const posBloqueio = await confirmarCpf(clienteInput.telefone, "7735");
    expect(posBloqueio.status).toBe("bloqueado");
  });

  it("um chute correto dentro de um lote concorrente que estoura o limite continua bloqueado (nao reseta tentativas nem emite token)", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);

    // Simula um brute-force paralelo real: um lote de tentativas erradas E o
    // chute certo disparados juntos, sem esperar resposta entre eles (só
    // 10.000 sufixos de CPF possíveis — um atacante real mandaria todos de
    // uma vez). O chute certo fica no meio do lote.
    //
    // Antes da correção deste bug, o write de sucesso era incondicional: se
    // o gate de bloqueio no topo da função (lido uma única vez, no início)
    // já tivesse sido lido por TODAS as chamadas do lote antes de qualquer
    // escrita comitar — o que é exatamente o que uma rajada concorrente real
    // tende a fazer —, nenhuma delas seria barrada por ele, e o write
    // incondicional do caminho de sucesso resetaria tentativasFalhas e
    // emitiria um sessionToken válido mesmo com o lote já tendo estourado o
    // limite de 3 erros.
    //
    // Usamos um lote grande (50 chutes errados + 1 certo) de propósito: com
    // poucos concorrentes, qual das requisições o Postgres serializa
    // primeiro é genuinamente aleatório — se o chute certo calhar de ser
    // processado entre as 3 primeiras operações da rajada, ele legitimamente
    // consome uma das 3 tentativas permitidas e É PARA suceder (isso não é
    // bug; é o mesmo resultado que teríamos se, por azar, a 1ª, 2ª ou 3ª
    // tentativa sequencial de verdade fosse a certa). O que a correção
    // garante é que a PROBABILIDADE disso passe de "sempre, garantido" (bug)
    // para, na prática, "no máximo ~3 em N" — do tamanho do próprio limite
    // de tentativas, e não da rajada inteira. Com N=50 essa chance já é
    // pequena o bastante pra nunca ter sido observada em dezenas de
    // execuções deste teste durante o desenvolvimento (ver relatório da
    // tarefa); ainda assim, se um dia flacar, é esse tradeoff estatístico —
    // e não uma regressão da correção — a primeira coisa a checar.
    const N_ERRADAS = 50;
    const INDICE_CERTO = 25;
    const chamadas = Array.from({ length: N_ERRADAS + 1 }, (_, i) =>
      i === INDICE_CERTO
        ? confirmarCpf(clienteInput.telefone, "7735")
        : confirmarCpf(clienteInput.telefone, "0000")
    );
    const resultados = await Promise.all(chamadas);
    const resultadoChuteCerto = resultados[INDICE_CERTO];

    // O chute certo NÃO pode ter sido confirmado: o write que reseta
    // tentativasFalhas e emite o sessionToken agora é condicional
    // (updateMany com tentativasFalhas < 3), avaliado no momento exato do
    // write, não numa leitura antiga do início da função.
    expect(resultadoChuteCerto.status).toBe("bloqueado");
    if (resultadoChuteCerto.status === "confirmado") {
      throw new Error(
        "chute correto dentro do lote bloqueado não deveria retornar sessionToken"
      );
    }

    const conversa = await prisma.conversa.findUnique({
      where: { telefone: clienteInput.telefone },
    });
    // A conta continua travada: nunca foi verificada e nenhum token foi
    // gravado, mesmo que o chute certo tenha "passado" pelo gate do topo.
    expect(conversa?.verificadoEm).toBeNull();
    expect(conversa?.sessionToken).toBeNull();
    expect(conversa?.tentativasFalhas).toBeGreaterThanOrEqual(3);

    // Exatamente um escalonamento, mesmo com o chute certo misturado no lote.
    const escalonamentos = await prisma.escalonamento.findMany({
      where: { clienteId: cliente.id },
    });
    expect(escalonamentos).toHaveLength(1);

    // E uma tentativa isolada e correta, depois do lote, continua bloqueada.
    const tentativaIsolada = await confirmarCpf(clienteInput.telefone, "7735");
    expect(tentativaIsolada.status).toBe("bloqueado");
  });
});
