# Atendimentos Pendentes (Fase 2 — Frente A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two database tables and the "Atendimentos pendentes" screen that Fase 2's WhatsApp bot (built separately, outside this codebase, as an n8n workflow) needs to hand escalated conversations off to advogados.

**Architecture:** Two new Prisma models (`Conversa`, `Escalonamento`) added to the existing schema, a `src/lib/escalonamentos.ts` service layer following the exact ownership-scoping pattern already used by every other service module (`getX`/`listX` filtered by `advogadoId`, `null` for not-owned), and one new screen under `/atendimentos` in the existing dashboard, following the exact patterns from the admin advogados screen (Task 14 of the prior plan).

**Tech Stack:** Same as the existing codebase — Next.js 16, Prisma (pinned 6.19.3), PostgreSQL, Vitest. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-09-03-bot-whatsapp-design.md](../specs/2026-09-03-bot-whatsapp-design.md)

## Global Constraints

- One git commit per file touched — never stage more than one file in a single commit.
- Business logic lives in `src/lib/*.ts` service modules — Server Actions/pages are thin wrappers.
- Every read/write is scoped by `advogadoId` (the requesting advogado from `auth()`), returning `null` for records that exist but aren't owned by the caller — never a distinguishable error.
- Tests run against the real Postgres test database (`npm test`), no mocks.
- **`Escalonamento` rows are only ever read and resolved by this codebase, never created here.** Creation is the WhatsApp bot's job (a separate n8n workflow, outside this repo, writing to Postgres directly) — do not add a `createEscalonamento` function. Test fixtures create rows directly via `prisma.escalonamento.create(...)` to simulate what the bot will do.
- `src/lib/testHelpers.ts`'s `resetDb()` (`TRUNCATE ... clientes, advogados ... CASCADE`) does **not** need to be modified for the new `escalonamentos` table — Postgres's `CASCADE` already truncates it automatically, since it has foreign keys to both `clientes` and `advogados`. Do not add `escalonamentos` to the explicit table list; it's redundant and the whole point of `CASCADE` is to not need it. (`conversas` has no such FK relationship and is untouched by `resetDb()` — that's fine, no code in this plan reads or writes `Conversa`.)

---

## Task 1: Prisma schema — Conversa and Escalonamento models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_conversa_escalonamento/migration.sql` (generated)

**Interfaces:**
- Produces: `Conversa` and `Escalonamento` Prisma models, plus `escalonamentos Escalonamento[]` relation fields added to the existing `Cliente` and `Advogado` models.

- [ ] **Step 1: Add the two models to `prisma/schema.prisma`**

Add these two models (anywhere after the existing `HistoricoStatus` model is a good place):

```prisma
model Conversa {
  id               String    @id @default(uuid())
  telefone         String    @unique
  verificadoEm     DateTime? @map("verificado_em")
  tentativasFalhas Int       @default(0) @map("tentativas_falhas")
  ultimaMensagemEm DateTime  @map("ultima_mensagem_em")
  criadoEm         DateTime  @default(now()) @map("criado_em")

  @@map("conversas")
}

model Escalonamento {
  id              String    @id @default(uuid())
  clienteId       String    @map("cliente_id")
  cliente         Cliente   @relation(fields: [clienteId], references: [id])
  advogadoId      String    @map("advogado_id")
  advogado        Advogado  @relation(fields: [advogadoId], references: [id])
  telefone        String
  mensagemCliente String    @map("mensagem_cliente")
  motivo          String?
  criadoEm        DateTime  @default(now()) @map("criado_em")
  resolvidoEm     DateTime? @map("resolvido_em")

  @@map("escalonamentos")
}
```

Then add one relation field to each of the two existing models it references. In `model Cliente`, add (next to the existing `processos Processo[]` line):

```prisma
  escalonamentos Escalonamento[]
```

In `model Advogado`, add (next to the existing `processos Processo[]` line):

```prisma
  escalonamentos Escalonamento[]
```

- [ ] **Step 2: Commit `prisma/schema.prisma`**

```bash
git add prisma/schema.prisma && git commit -m "feat: add conversa and escalonamento models to schema"
```

- [ ] **Step 3: Run the migration**

```bash
npx prisma migrate dev --name add_conversa_escalonamento
```

- [ ] **Step 4: Commit the generated migration file**

```bash
git add prisma/migrations/*_add_conversa_escalonamento/migration.sql && git commit -m "chore: add migration for conversa and escalonamento tables"
```

(`migration_lock.toml` already exists from the first migration and won't change — only the new `migration.sql` is new.)

- [ ] **Step 5: Apply the same migration to the test database**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/iaparaadvogados_test" npx prisma migrate deploy
```

- [ ] **Step 6: Verify**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid`

---

## Task 2: Escalonamento service layer

**Files:**
- Create: `src/lib/escalonamentos.ts`
- Create: `src/lib/escalonamentos.test.ts`

**Interfaces:**
- Consumes: `prisma` (from `src/lib/db.ts`), `createCliente` (from `src/lib/clientes.ts`, test-only), `resetDb`/`makeAdvogado` (from `src/lib/testHelpers.ts`).
- Produces: `listEscalonamentosPendentes(advogadoId: string): Promise<Escalonamento[]>`, `resolverEscalonamento(advogadoId: string, escalonamentoId: string): Promise<Escalonamento | null>`.

- [ ] **Step 1: Write the failing test `src/lib/escalonamentos.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db";
import { resetDb, makeAdvogado } from "./testHelpers";
import { createCliente } from "./clientes";
import {
  listEscalonamentosPendentes,
  resolverEscalonamento,
} from "./escalonamentos";

const clienteInput = {
  nome: "Maria Silva",
  telefone: "+5511999990000",
  cpf: "111.444.777-35",
};

async function makeEscalonamento(
  advogadoId: string,
  clienteId: string,
  overrides: Partial<{
    telefone: string;
    mensagemCliente: string;
    motivo: string | null;
    resolvidoEm: Date | null;
  }> = {}
) {
  return prisma.escalonamento.create({
    data: {
      advogadoId,
      clienteId,
      telefone: overrides.telefone ?? "+5511999990000",
      mensagemCliente: overrides.mensagemCliente ?? "Preciso falar com alguém",
      motivo: overrides.motivo ?? "fora do escopo",
      resolvidoEm: overrides.resolvidoEm ?? null,
    },
  });
}

describe("escalonamentos service", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lista apenas escalonamentos pendentes do advogado logado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const clienteA = await createCliente(advogadoA.id, clienteInput);

    const pendente = await makeEscalonamento(advogadoA.id, clienteA.id);
    await makeEscalonamento(advogadoA.id, clienteA.id, {
      resolvidoEm: new Date(),
    });

    const lista = await listEscalonamentosPendentes(advogadoA.id);
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe(pendente.id);

    const listaB = await listEscalonamentosPendentes(advogadoB.id);
    expect(listaB).toHaveLength(0);
  });

  it("resolve um escalonamento e marca resolvido_em", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);
    const escalonamento = await makeEscalonamento(advogado.id, cliente.id);

    const resolvido = await resolverEscalonamento(advogado.id, escalonamento.id);
    expect(resolvido?.resolvidoEm).not.toBeNull();
  });

  it("não permite resolver escalonamento de outro advogado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, clienteInput);
    const escalonamento = await makeEscalonamento(advogadoA.id, cliente.id);

    const result = await resolverEscalonamento(advogadoB.id, escalonamento.id);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm test -- escalonamentos`
Expected: FAIL — `src/lib/escalonamentos.ts` does not exist.

- [ ] **Step 3: Write `src/lib/escalonamentos.ts`**

```ts
import { prisma } from "./db";

export async function listEscalonamentosPendentes(advogadoId: string) {
  return prisma.escalonamento.findMany({
    where: { advogadoId, resolvidoEm: null },
    orderBy: { criadoEm: "asc" },
  });
}

export async function resolverEscalonamento(
  advogadoId: string,
  escalonamentoId: string
) {
  const existing = await prisma.escalonamento.findFirst({
    where: { id: escalonamentoId, advogadoId },
  });
  if (!existing) return null;

  return prisma.escalonamento.update({
    where: { id: escalonamentoId },
    data: { resolvidoEm: new Date() },
  });
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `npm test -- escalonamentos`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit `src/lib/escalonamentos.ts`**

```bash
git add src/lib/escalonamentos.ts && git commit -m "feat: add escalonamentos service layer"
```

- [ ] **Step 6: Commit `src/lib/escalonamentos.test.ts`**

```bash
git add src/lib/escalonamentos.test.ts && git commit -m "test: add escalonamentos service tests"
```

- [ ] **Step 7: Run the full unfiltered suite**

Run: `npm test`
Expected: all test files pass (52 tests: 49 existing + 3 new).

---

## Task 3: Atendimentos pendentes screen

**Files:**
- Create: `src/app/actions/escalonamentos.ts`
- Create: `src/app/(dashboard)/atendimentos/page.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `auth` (from `src/lib/auth.ts`), `listEscalonamentosPendentes`/`resolverEscalonamento` (Task 2).

- [ ] **Step 1: Write `src/app/actions/escalonamentos.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolverEscalonamento } from "@/lib/escalonamentos";

export async function resolverEscalonamentoAction(escalonamentoId: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await resolverEscalonamento(session.user.id, escalonamentoId);
  revalidatePath("/atendimentos");
}
```

- [ ] **Step 2: Commit `src/app/actions/escalonamentos.ts`**

```bash
git add src/app/actions/escalonamentos.ts && git commit -m "feat: add resolver escalonamento server action"
```

- [ ] **Step 3: Write `src/app/(dashboard)/atendimentos/page.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { listEscalonamentosPendentes } from "@/lib/escalonamentos";
import { resolverEscalonamentoAction } from "@/app/actions/escalonamentos";

export default async function AtendimentosPage() {
  const session = await auth();
  const escalonamentos = await listEscalonamentosPendentes(session!.user.id);

  return (
    <div>
      <h1>Atendimentos pendentes</h1>
      {escalonamentos.length === 0 && <p>Nenhum atendimento pendente.</p>}
      <ul>
        {escalonamentos.map((e) => (
          <li key={e.id}>
            <p>Telefone: {e.telefone}</p>
            <p>Mensagem: {e.mensagemCliente}</p>
            {e.motivo && <p>Motivo: {e.motivo}</p>}
            <p>{e.criadoEm.toLocaleString("pt-BR")}</p>
            <form
              action={async () => {
                "use server";
                await resolverEscalonamentoAction(e.id);
              }}
            >
              <button type="submit">Marcar como resolvido</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

This inline-server-action-in-a-loop pattern is the same one already used (and verified safe) in `src/app/(dashboard)/admin/advogados/page.tsx` from the prior plan — `.map()` gives each row its own closure, so each button targets the correct `e.id`.

- [ ] **Step 4: Commit `src/app/(dashboard)/atendimentos/page.tsx`**

```bash
git add "src/app/(dashboard)/atendimentos/page.tsx" && git commit -m "feat: add atendimentos pendentes page"
```

- [ ] **Step 5: Add a nav link in `src/app/(dashboard)/layout.tsx`**

Find the existing `<Link href="/clientes">Clientes</Link>` line and add a new link right after it:

```tsx
<Link href="/atendimentos">Atendimentos</Link>
```

So the `<nav>` block reads (existing admin-link and sign-out form unchanged):

```tsx
<nav>
  <Link href="/clientes">Clientes</Link>
  <Link href="/atendimentos">Atendimentos</Link>
  {session.user.isAdmin && <Link href="/admin/advogados">Advogados</Link>}
  <form action={signOutAction}>
    <button type="submit">Sair</button>
  </form>
</nav>
```

- [ ] **Step 6: Commit `src/app/(dashboard)/layout.tsx`**

```bash
git add "src/app/(dashboard)/layout.tsx" && git commit -m "feat: add atendimentos link to dashboard nav"
```

- [ ] **Step 7: Verify manually**

```bash
npm run dev
```

Log in as the seeded admin. Visit `/atendimentos` — expect "Nenhum atendimento pendente." Manually insert a test row (e.g. via `npx prisma studio`, using the seeded admin's own `id` as `advogadoId` and any existing cliente's `id`) with `resolvidoEm` left null. Refresh `/atendimentos` — expect it to appear with its telefone/mensagem/motivo. Click "Marcar como resolvido" — expect it to disappear from the list. Confirm the "Atendimentos" link appears in the nav for every advogado (not just admins).

- [ ] **Step 8: Run the full unfiltered suite one more time**

Run: `npm test`
Expected: 52/52 passing (unchanged from Task 2 — this task added no new automated tests).

---

## Final verification

- [ ] Run `npm test` — expect 52/52 passing.
- [ ] Run `npm run build` — expect a clean production build.
- [ ] Walk through Task 3's manual verification steps once more end to end in one session.
