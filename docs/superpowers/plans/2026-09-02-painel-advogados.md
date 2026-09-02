# Painel do Advogado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Fase 1 web app — a login-protected panel where lawyers register and maintain their own clients, cases (processos), and status history, forming the data foundation the Fase 2 WhatsApp bot will query later.

**Architecture:** Next.js (App Router) serving both UI and Server Actions, backed by a self-hosted PostgreSQL database via Prisma. Business logic (ownership checks, validation, uniqueness rules) lives in framework-independent `src/lib/*.ts` service modules that Server Actions and Server Components call — this is what makes the logic unit-testable without a running HTTP server. Auth.js (NextAuth v5, credentials provider) handles login/session; middleware protects all routes except `/login`.

**Tech Stack:** Next.js 15 (App Router, TypeScript, src/ dir), PostgreSQL, Prisma, Auth.js (next-auth v5), bcryptjs, Zod, Vitest, deployed via Coolify (Dockerfile, standalone output).

**Spec:** [docs/superpowers/specs/2026-09-02-painel-advogados-design.md](../specs/2026-09-02-painel-advogados-design.md)

## Global Constraints

- Node.js 20+, npm as the package manager (not pnpm/yarn).
- Next.js App Router, TypeScript strict mode, import alias `@/*` → `src/*`.
- **One git commit per file touched.** Never stage more than one file in a single commit, even within the same task. When a single command produces many files at once (project scaffold, `prisma migrate dev`), commit each generated file individually and in the order `git status --porcelain` lists them, using the loop pattern shown in Task 1.
- Tests run against a **real PostgreSQL database** (`DATABASE_URL`, swapped to the test DB via `.env.test` + `dotenv-cli` when running `npm test`) — no mocks, no SQLite.
- All business logic (ownership scoping, uniqueness, validation) lives in `src/lib/*.ts` service modules — never inline in Server Actions, route handlers, or React components. Server Actions/pages are thin: parse input, call a service function, handle the result.
- `Cliente.telefone` is globally unique (not just per-advogado) — Fase 2 will look up a client by phone number alone, before knowing which advogado owns it.
- `HistoricoStatus` is append-only — no update/delete function is ever added for it.
- Accessing another advogado's `Cliente`/`Processo` returns `null` from the service layer (translated to a 404-style "not found" in the UI), never a 403 — this avoids confirming the record exists.

---

## Task 1: Scaffold Next.js project

**Files:**
- Create: full Next.js scaffold (`package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `public/*`, `.gitignore`, etc.)

**Interfaces:**
- Produces: a buildable Next.js app at the project root, `src/` directory convention, `@/*` import alias.

- [ ] **Step 1: Run the scaffold command**

```bash
npx --yes create-next-app@latest . --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm
```

If your installed `create-next-app` prompts interactively instead of honoring these flags, answer: TypeScript = Yes, ESLint = Yes, Tailwind = Yes, `src/` directory = Yes, App Router = Yes, import alias = `@/*`, package manager = npm. The command is safe to run in this non-empty directory — it only checks for filename conflicts, and the existing `docs/` folder doesn't conflict with anything it generates.

- [ ] **Step 2: Commit every generated file individually**

```bash
git status --porcelain | awk '{print $2}' | while IFS= read -r f; do
  git add "$f"
  git commit -m "chore: scaffold $f"
done
```

- [ ] **Step 3: Verify the app builds**

Run: `npm run build`
Expected: build completes with no errors (default Next.js starter page).

---

## Task 2: Prisma schema + client + initial migration

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`
- Create: `.env.example`
- Create: `.env.test.example`
- Modify: `.gitignore`
- Modify: `package.json`, `package-lock.json` (add `prisma`, `@prisma/client`)

**Interfaces:**
- Produces: `prisma` (a `PrismaClient` singleton) exported from `src/lib/db.ts`, used by every service module from here on.

- [ ] **Step 1: Install Prisma**

```bash
npm install @prisma/client
npm install -D prisma
```

- [ ] **Step 2: Commit `package.json`**

```bash
git add package.json && git commit -m "chore: add prisma dependencies"
```

- [ ] **Step 3: Commit `package-lock.json`**

```bash
git add package-lock.json && git commit -m "chore: update package-lock for prisma"
```

- [ ] **Step 4: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Advogado {
  id        String   @id @default(uuid())
  nome      String
  email     String   @unique
  senhaHash String   @map("senha_hash")
  isAdmin   Boolean  @default(false) @map("is_admin")
  ativo     Boolean  @default(true)
  criadoEm  DateTime @default(now()) @map("criado_em")

  clientes  Cliente[]
  processos Processo[]

  @@map("advogados")
}

model Cliente {
  id         String   @id @default(uuid())
  advogadoId String   @map("advogado_id")
  advogado   Advogado @relation(fields: [advogadoId], references: [id])
  nome       String
  telefone   String   @unique
  cpf        String
  criadoEm   DateTime @default(now()) @map("criado_em")

  processos  Processo[]

  @@map("clientes")
}

enum SituacaoProcesso {
  ativo
  encerrado
}

model Processo {
  id             String            @id @default(uuid())
  clienteId      String            @map("cliente_id")
  cliente        Cliente           @relation(fields: [clienteId], references: [id])
  advogadoId     String            @map("advogado_id")
  advogado       Advogado          @relation(fields: [advogadoId], references: [id])
  numeroProcesso String            @map("numero_processo")
  descricao      String
  statusAtual    String            @map("status_atual")
  situacao       SituacaoProcesso  @default(ativo)
  criadoEm       DateTime          @default(now()) @map("criado_em")
  atualizadoEm   DateTime          @updatedAt @map("atualizado_em")

  historico      HistoricoStatus[]

  @@map("processos")
}

model HistoricoStatus {
  id         String   @id @default(uuid())
  processoId String   @map("processo_id")
  processo   Processo @relation(fields: [processoId], references: [id])
  texto      String
  criadoEm   DateTime @default(now()) @map("criado_em")

  @@map("historico_status")
}
```

- [ ] **Step 5: Commit `prisma/schema.prisma`**

```bash
git add prisma/schema.prisma && git commit -m "feat: add prisma schema for advogado, cliente, processo, historico"
```

- [ ] **Step 6: Fix `.gitignore` so `.env`/`.env.test` are ignored but the `.example` files are committed**

Find the line `.env*` in `.gitignore` (added by create-next-app) and replace it with:

```
.env
.env.test
!.env.example
!.env.test.example
```

- [ ] **Step 7: Commit `.gitignore`**

```bash
git add .gitignore && git commit -m "chore: ignore env files but allow env examples"
```

- [ ] **Step 8: Write `.env.example`**

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/iaparaadvogados"
AUTH_SECRET="generate with: npx auth secret"
```

- [ ] **Step 9: Commit `.env.example`**

```bash
git add .env.example && git commit -m "docs: document required env vars"
```

- [ ] **Step 10: Write `.env.test.example`**

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/iaparaadvogados_test"
AUTH_SECRET="test-secret-not-used-for-anything-real"
```

- [ ] **Step 11: Commit `.env.test.example`**

```bash
git add .env.test.example && git commit -m "docs: document test env vars"
```

- [ ] **Step 12: Create local `.env` and `.env.test` (not committed) and provision Postgres**

If you don't already have a local Postgres reachable, run:

```bash
docker run --name iaparaadvogados-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
docker exec -it iaparaadvogados-db psql -U postgres -c 'CREATE DATABASE iaparaadvogados;'
docker exec -it iaparaadvogados-db psql -U postgres -c 'CREATE DATABASE iaparaadvogados_test;'
```

Copy `.env.example` to `.env` and `.env.test.example` to `.env.test` (these stay untracked).

- [ ] **Step 13: Write `src/lib/db.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 14: Commit `src/lib/db.ts`**

```bash
git add src/lib/db.ts && git commit -m "feat: add prisma client singleton"
```

- [ ] **Step 15: Run the initial migration**

```bash
npx prisma migrate dev --name init
```

- [ ] **Step 16: Commit every file the migration generated**

```bash
git status --porcelain | awk '{print $2}' | while IFS= read -r f; do
  git add "$f"
  git commit -m "chore: prisma migration file $f"
done
```

- [ ] **Step 17: Verify**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid`

---

## Task 3: Test tooling (Vitest) + shared test helpers

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/testHelpers.ts`
- Create: `src/lib/testHelpers.test.ts`
- Modify: `package.json`, `package-lock.json` (add `vitest`, `dotenv-cli`, `vite-tsconfig-paths`)

**Interfaces:**
- Consumes: `prisma` from `src/lib/db.ts` (Task 2).
- Produces: `resetDb(): Promise<void>` and `makeAdvogado(overrides?): Promise<Advogado>` from `src/lib/testHelpers.ts`, used by every service test from here on.

- [ ] **Step 1: Install test deps**

```bash
npm install -D vitest dotenv-cli vite-tsconfig-paths
```

- [ ] **Step 2: Commit `package.json`**

```bash
git add package.json && git commit -m "chore: add vitest and test tooling dependencies"
```

- [ ] **Step 3: Commit `package-lock.json`**

```bash
git add package-lock.json && git commit -m "chore: update package-lock for test tooling"
```

- [ ] **Step 4: Add the `test` script to `package.json`**

```json
"scripts": {
  "test": "dotenv -e .env.test -- vitest run"
}
```

- [ ] **Step 5: Commit `package.json`**

```bash
git add package.json && git commit -m "chore: add test script"
```

- [ ] **Step 6: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 7: Commit `vitest.config.ts`**

```bash
git add vitest.config.ts && git commit -m "feat: configure vitest"
```

- [ ] **Step 8: Write `src/lib/testHelpers.ts`**

```ts
import { prisma } from "./db";

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "historico_status", "processos", "clientes", "advogados" RESTART IDENTITY CASCADE'
  );
}

export async function makeAdvogado(
  overrides: Partial<{
    nome: string;
    email: string;
    isAdmin: boolean;
    ativo: boolean;
    senhaHash: string;
  }> = {}
) {
  return prisma.advogado.create({
    data: {
      nome: overrides.nome ?? "Advogado Teste",
      email: overrides.email ?? `advogado-${crypto.randomUUID()}@teste.com`,
      senhaHash: overrides.senhaHash ?? "hash-fake-para-teste",
      isAdmin: overrides.isAdmin ?? false,
      ativo: overrides.ativo ?? true,
    },
  });
}
```

- [ ] **Step 9: Commit `src/lib/testHelpers.ts`**

```bash
git add src/lib/testHelpers.ts && git commit -m "feat: add shared test db helpers"
```

- [ ] **Step 10: Write `src/lib/testHelpers.test.ts`** (smoke test for the DB connection itself)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db";
import { resetDb, makeAdvogado } from "./testHelpers";

describe("test database", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("starts empty after reset", async () => {
    expect(await prisma.advogado.count()).toBe(0);
  });

  it("makeAdvogado creates a usable row", async () => {
    const advogado = await makeAdvogado({ nome: "Fulano" });
    expect(advogado.nome).toBe("Fulano");
    expect(await prisma.advogado.count()).toBe(1);
  });
});
```

- [ ] **Step 11: Commit `src/lib/testHelpers.test.ts`**

```bash
git add src/lib/testHelpers.test.ts && git commit -m "test: verify test database reset and factory"
```

- [ ] **Step 12: Apply migrations to the test database and run**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/iaparaadvogados_test" npx prisma migrate deploy
npm test
```

Expected: 2 tests pass.

---

## Task 4: Password hashing utility

**Files:**
- Create: `src/lib/password.ts`
- Create: `src/lib/password.test.ts`
- Modify: `package.json`, `package-lock.json` (add `bcryptjs`, `@types/bcryptjs`)

**Interfaces:**
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`.

- [ ] **Step 1: Install bcryptjs**

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

- [ ] **Step 2: Commit `package.json`**

```bash
git add package.json && git commit -m "chore: add bcryptjs dependency"
```

- [ ] **Step 3: Commit `package-lock.json`**

```bash
git add package-lock.json && git commit -m "chore: update package-lock for bcryptjs"
```

- [ ] **Step 4: Write the failing test `src/lib/password.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("hashes a password and verifies it correctly", async () => {
    const hash = await hashPassword("senha-super-secreta");
    expect(hash).not.toBe("senha-super-secreta");
    expect(await verifyPassword("senha-super-secreta", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("senha-correta");
    expect(await verifyPassword("senha-errada", hash)).toBe(false);
  });
});
```

- [ ] **Step 5: Run and verify it fails**

Run: `npm test -- password`
Expected: FAIL — `src/lib/password.ts` does not exist.

- [ ] **Step 6: Write `src/lib/password.ts`**

```ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 7: Run and verify it passes**

Run: `npm test -- password`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit `src/lib/password.ts`**

```bash
git add src/lib/password.ts && git commit -m "feat: add password hashing utility"
```

- [ ] **Step 9: Commit `src/lib/password.test.ts`**

```bash
git add src/lib/password.test.ts && git commit -m "test: add password hashing tests"
```

---

## Task 5: Validation schemas (CPF, telefone, cliente, advogado)

**Files:**
- Create: `src/lib/validation.ts`
- Create: `src/lib/validation.test.ts`
- Modify: `package.json`, `package-lock.json` (add `zod`)

**Interfaces:**
- Produces: `isValidCPF(cpf: string): boolean`, `isValidE164(phone: string): boolean`, `clienteSchema` (Zod, infers `ClienteInput = { nome: string; telefone: string; cpf: string }`), `advogadoSchema` (Zod, infers `AdvogadoInput = { nome: string; email: string; senha: string; isAdmin?: boolean }`).

- [ ] **Step 1: Install zod**

```bash
npm install zod
```

- [ ] **Step 2: Commit `package.json`**

```bash
git add package.json && git commit -m "chore: add zod dependency"
```

- [ ] **Step 3: Commit `package-lock.json`**

```bash
git add package-lock.json && git commit -m "chore: update package-lock for zod"
```

- [ ] **Step 4: Write the failing test `src/lib/validation.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { isValidCPF, isValidE164, clienteSchema, advogadoSchema } from "./validation";

describe("isValidCPF", () => {
  it("accepts a valid CPF", () => {
    expect(isValidCPF("111.444.777-35")).toBe(true);
  });

  it("rejects a CPF with all repeated digits", () => {
    expect(isValidCPF("111.111.111-11")).toBe(false);
  });

  it("rejects a CPF with a wrong check digit", () => {
    expect(isValidCPF("111.444.777-36")).toBe(false);
  });
});

describe("isValidE164", () => {
  it("accepts a valid E.164 phone", () => {
    expect(isValidE164("+5511999990000")).toBe(true);
  });

  it("rejects a phone without country code", () => {
    expect(isValidE164("11999990000")).toBe(false);
  });
});

describe("clienteSchema", () => {
  it("accepts valid input", () => {
    const result = clienteSchema.safeParse({
      nome: "Maria Silva",
      telefone: "+5511999990000",
      cpf: "111.444.777-35",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = clienteSchema.safeParse({
      nome: "",
      telefone: "+5511999990000",
      cpf: "111.444.777-35",
    });
    expect(result.success).toBe(false);
  });
});

describe("advogadoSchema", () => {
  it("accepts valid input", () => {
    const result = advogadoSchema.safeParse({
      nome: "Dr. Fulano",
      email: "fulano@escritorio.com",
      senha: "senha1234",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a short password", () => {
    const result = advogadoSchema.safeParse({
      nome: "Dr. Fulano",
      email: "fulano@escritorio.com",
      senha: "123",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 5: Run and verify it fails**

Run: `npm test -- validation`
Expected: FAIL — `src/lib/validation.ts` does not exist.

- [ ] **Step 6: Write `src/lib/validation.ts`**

```ts
import { z } from "zod";

export function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcCheckDigit = (base: string, factorStart: number): number => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += parseInt(base[i], 10) * (factorStart - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const base9 = digits.slice(0, 9);
  const digit1 = calcCheckDigit(base9, 10);
  const digit2 = calcCheckDigit(base9 + digit1, 11);

  return digits === base9 + String(digit1) + String(digit2);
}

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone);
}

export const clienteSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório"),
  telefone: z
    .string()
    .trim()
    .refine(isValidE164, "Telefone deve estar no formato internacional, ex: +5511999999999"),
  cpf: z.string().trim().refine(isValidCPF, "CPF inválido"),
});

export type ClienteInput = z.infer<typeof clienteSchema>;

export const advogadoSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório"),
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  isAdmin: z.boolean().optional(),
});

export type AdvogadoInput = z.infer<typeof advogadoSchema>;
```

- [ ] **Step 7: Run and verify it passes**

Run: `npm test -- validation`
Expected: PASS (8 tests).

- [ ] **Step 8: Commit `src/lib/validation.ts`**

```bash
git add src/lib/validation.ts && git commit -m "feat: add cpf, phone and entity validation schemas"
```

- [ ] **Step 9: Commit `src/lib/validation.test.ts`**

```bash
git add src/lib/validation.test.ts && git commit -m "test: add validation schema tests"
```

---

## Task 6: Cliente service layer

**Files:**
- Create: `src/lib/clientes.ts`
- Create: `src/lib/clientes.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `clienteSchema`/`ClienteInput` (Task 5), `resetDb`/`makeAdvogado` (Task 3).
- Produces: `createCliente(advogadoId, input): Promise<Cliente>`, `listClientesByAdvogado(advogadoId): Promise<Cliente[]>`, `getClienteForAdvogado(advogadoId, clienteId): Promise<Cliente | null>`, `updateCliente(advogadoId, clienteId, input): Promise<Cliente | null>`, `TelefoneDuplicadoError`.

- [ ] **Step 1: Write the failing test `src/lib/clientes.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeAdvogado } from "./testHelpers";
import {
  createCliente,
  listClientesByAdvogado,
  getClienteForAdvogado,
  updateCliente,
  TelefoneDuplicadoError,
} from "./clientes";

const validInput = {
  nome: "Maria Silva",
  telefone: "+5511999990000",
  cpf: "111.444.777-35",
};

describe("clientes service", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("cria um cliente vinculado ao advogado", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, validInput);
    expect(cliente.nome).toBe("Maria Silva");
    expect(cliente.advogadoId).toBe(advogado.id);
  });

  it("rejeita telefone duplicado entre advogados diferentes", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    await createCliente(advogadoA.id, validInput);

    await expect(
      createCliente(advogadoB.id, { ...validInput, nome: "Outro Nome" })
    ).rejects.toBeInstanceOf(TelefoneDuplicadoError);
  });

  it("lista apenas os clientes do advogado logado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    await createCliente(advogadoA.id, validInput);
    await createCliente(advogadoB.id, {
      ...validInput,
      telefone: "+5511999990001",
    });

    const clientesA = await listClientesByAdvogado(advogadoA.id);
    expect(clientesA).toHaveLength(1);
    expect(clientesA[0].advogadoId).toBe(advogadoA.id);
  });

  it("não permite um advogado acessar cliente de outro", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, validInput);

    expect(await getClienteForAdvogado(advogadoB.id, cliente.id)).toBeNull();
  });

  it("não permite um advogado editar cliente de outro", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, validInput);

    const result = await updateCliente(advogadoB.id, cliente.id, {
      ...validInput,
      nome: "Nome Alterado",
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm test -- clientes`
Expected: FAIL — `src/lib/clientes.ts` does not exist.

- [ ] **Step 3: Write `src/lib/clientes.ts`**

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { clienteSchema, type ClienteInput } from "./validation";

export class TelefoneDuplicadoError extends Error {
  constructor() {
    super("Já existe um cliente cadastrado com esse telefone.");
    this.name = "TelefoneDuplicadoError";
  }
}

export async function createCliente(advogadoId: string, input: ClienteInput) {
  const data = clienteSchema.parse(input);
  try {
    return await prisma.cliente.create({ data: { ...data, advogadoId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new TelefoneDuplicadoError();
    }
    throw err;
  }
}

export async function listClientesByAdvogado(advogadoId: string) {
  return prisma.cliente.findMany({
    where: { advogadoId },
    orderBy: { nome: "asc" },
  });
}

export async function getClienteForAdvogado(advogadoId: string, clienteId: string) {
  return prisma.cliente.findFirst({ where: { id: clienteId, advogadoId } });
}

export async function updateCliente(
  advogadoId: string,
  clienteId: string,
  input: ClienteInput
) {
  const data = clienteSchema.parse(input);
  const existing = await getClienteForAdvogado(advogadoId, clienteId);
  if (!existing) return null;

  try {
    return await prisma.cliente.update({ where: { id: clienteId }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new TelefoneDuplicadoError();
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `npm test -- clientes`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit `src/lib/clientes.ts`**

```bash
git add src/lib/clientes.ts && git commit -m "feat: add cliente service layer with ownership scoping"
```

- [ ] **Step 6: Commit `src/lib/clientes.test.ts`**

```bash
git add src/lib/clientes.test.ts && git commit -m "test: add cliente service tests"
```

---

## Task 7: Processo service layer

**Files:**
- Create: `src/lib/processos.ts`
- Create: `src/lib/processos.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `getClienteForAdvogado` (Task 6), `resetDb`/`makeAdvogado` (Task 3).
- Produces: `ProcessoInput = { numeroProcesso: string; descricao: string; statusAtual: string }`, `createProcesso(advogadoId, clienteId, input): Promise<Processo>`, `listProcessosByCliente(advogadoId, clienteId): Promise<Processo[] | null>`, `getProcessoForAdvogado(advogadoId, processoId): Promise<Processo | null>`, `updateProcesso(advogadoId, processoId, input): Promise<Processo | null>`, `ClienteNaoEncontradoError`.

- [ ] **Step 1: Write the failing test `src/lib/processos.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeAdvogado } from "./testHelpers";
import { createCliente } from "./clientes";
import {
  createProcesso,
  listProcessosByCliente,
  getProcessoForAdvogado,
  updateProcesso,
  ClienteNaoEncontradoError,
} from "./processos";

const clienteInput = {
  nome: "Maria Silva",
  telefone: "+5511999990000",
  cpf: "111.444.777-35",
};

const processoInput = {
  numeroProcesso: "0001234-56.2026.8.26.0100",
  descricao: "Ação de cobrança",
  statusAtual: "Aguardando distribuição",
};

describe("processos service", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("cria um processo vinculado ao cliente e ao advogado", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);

    const processo = await createProcesso(advogado.id, cliente.id, processoInput);
    expect(processo.clienteId).toBe(cliente.id);
    expect(processo.advogadoId).toBe(advogado.id);
    expect(processo.situacao).toBe("ativo");
  });

  it("rejeita criar processo em cliente de outro advogado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, clienteInput);

    await expect(
      createProcesso(advogadoB.id, cliente.id, processoInput)
    ).rejects.toBeInstanceOf(ClienteNaoEncontradoError);
  });

  it("lista processos apenas para o advogado dono do cliente", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, clienteInput);
    await createProcesso(advogadoA.id, cliente.id, processoInput);

    expect(await listProcessosByCliente(advogadoA.id, cliente.id)).toHaveLength(1);
    expect(await listProcessosByCliente(advogadoB.id, cliente.id)).toBeNull();
  });

  it("não permite acessar ou editar processo de outro advogado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, clienteInput);
    const processo = await createProcesso(advogadoA.id, cliente.id, processoInput);

    expect(await getProcessoForAdvogado(advogadoB.id, processo.id)).toBeNull();
    expect(
      await updateProcesso(advogadoB.id, processo.id, { situacao: "encerrado" })
    ).toBeNull();
  });

  it("atualiza a situação do processo", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);
    const processo = await createProcesso(advogado.id, cliente.id, processoInput);

    const updated = await updateProcesso(advogado.id, processo.id, {
      situacao: "encerrado",
    });
    expect(updated?.situacao).toBe("encerrado");
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm test -- processos`
Expected: FAIL — `src/lib/processos.ts` does not exist.

- [ ] **Step 3: Write `src/lib/processos.ts`**

```ts
import { prisma } from "./db";
import { getClienteForAdvogado } from "./clientes";

export class ClienteNaoEncontradoError extends Error {
  constructor() {
    super("Cliente não encontrado para este advogado.");
    this.name = "ClienteNaoEncontradoError";
  }
}

export interface ProcessoInput {
  numeroProcesso: string;
  descricao: string;
  statusAtual: string;
}

export async function createProcesso(
  advogadoId: string,
  clienteId: string,
  input: ProcessoInput
) {
  const cliente = await getClienteForAdvogado(advogadoId, clienteId);
  if (!cliente) throw new ClienteNaoEncontradoError();

  return prisma.processo.create({
    data: {
      clienteId,
      advogadoId,
      numeroProcesso: input.numeroProcesso,
      descricao: input.descricao,
      statusAtual: input.statusAtual,
    },
  });
}

export async function listProcessosByCliente(advogadoId: string, clienteId: string) {
  const cliente = await getClienteForAdvogado(advogadoId, clienteId);
  if (!cliente) return null;

  return prisma.processo.findMany({
    where: { clienteId },
    orderBy: { criadoEm: "desc" },
  });
}

export async function getProcessoForAdvogado(advogadoId: string, processoId: string) {
  return prisma.processo.findFirst({ where: { id: processoId, advogadoId } });
}

export async function updateProcesso(
  advogadoId: string,
  processoId: string,
  input: Partial<ProcessoInput> & { situacao?: "ativo" | "encerrado" }
) {
  const existing = await getProcessoForAdvogado(advogadoId, processoId);
  if (!existing) return null;

  return prisma.processo.update({ where: { id: processoId }, data: input });
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `npm test -- processos`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit `src/lib/processos.ts`**

```bash
git add src/lib/processos.ts && git commit -m "feat: add processo service layer with ownership scoping"
```

- [ ] **Step 6: Commit `src/lib/processos.test.ts`**

```bash
git add src/lib/processos.test.ts && git commit -m "test: add processo service tests"
```

---

## Task 8: Historico service layer

**Files:**
- Create: `src/lib/historico.ts`
- Create: `src/lib/historico.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `getProcessoForAdvogado` (Task 7), `resetDb`/`makeAdvogado` (Task 3).
- Produces: `addHistoricoStatus(advogadoId, processoId, texto): Promise<HistoricoStatus>`, `listHistoricoForProcesso(advogadoId, processoId): Promise<HistoricoStatus[] | null>`, `ProcessoNaoEncontradoError`.

- [ ] **Step 1: Write the failing test `src/lib/historico.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeAdvogado } from "./testHelpers";
import { createCliente } from "./clientes";
import { createProcesso } from "./processos";
import {
  addHistoricoStatus,
  listHistoricoForProcesso,
  ProcessoNaoEncontradoError,
} from "./historico";

const clienteInput = {
  nome: "Maria Silva",
  telefone: "+5511999990000",
  cpf: "111.444.777-35",
};

const processoInput = {
  numeroProcesso: "0001234-56.2026.8.26.0100",
  descricao: "Ação de cobrança",
  statusAtual: "Aguardando distribuição",
};

describe("historico service", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("adiciona uma entrada e atualiza o status_atual do processo", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);
    const processo = await createProcesso(advogado.id, cliente.id, processoInput);

    const entrada = await addHistoricoStatus(
      advogado.id,
      processo.id,
      "Audiência marcada para 10/10"
    );
    expect(entrada.texto).toBe("Audiência marcada para 10/10");

    const historico = await listHistoricoForProcesso(advogado.id, processo.id);
    expect(historico).toHaveLength(1);
  });

  it("rejeita adicionar histórico em processo de outro advogado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, clienteInput);
    const processo = await createProcesso(advogadoA.id, cliente.id, processoInput);

    await expect(
      addHistoricoStatus(advogadoB.id, processo.id, "Tentativa indevida")
    ).rejects.toBeInstanceOf(ProcessoNaoEncontradoError);
  });

  it("não permite listar histórico de processo de outro advogado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, clienteInput);
    const processo = await createProcesso(advogadoA.id, cliente.id, processoInput);

    expect(await listHistoricoForProcesso(advogadoB.id, processo.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm test -- historico`
Expected: FAIL — `src/lib/historico.ts` does not exist.

- [ ] **Step 3: Write `src/lib/historico.ts`**

```ts
import { prisma } from "./db";
import { getProcessoForAdvogado } from "./processos";

export class ProcessoNaoEncontradoError extends Error {
  constructor() {
    super("Processo não encontrado para este advogado.");
    this.name = "ProcessoNaoEncontradoError";
  }
}

export async function addHistoricoStatus(
  advogadoId: string,
  processoId: string,
  texto: string
) {
  const processo = await getProcessoForAdvogado(advogadoId, processoId);
  if (!processo) throw new ProcessoNaoEncontradoError();

  return prisma.$transaction(async (tx) => {
    const entrada = await tx.historicoStatus.create({
      data: { processoId, texto },
    });
    await tx.processo.update({
      where: { id: processoId },
      data: { statusAtual: texto },
    });
    return entrada;
  });
}

export async function listHistoricoForProcesso(advogadoId: string, processoId: string) {
  const processo = await getProcessoForAdvogado(advogadoId, processoId);
  if (!processo) return null;

  return prisma.historicoStatus.findMany({
    where: { processoId },
    orderBy: { criadoEm: "desc" },
  });
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `npm test -- historico`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit `src/lib/historico.ts`**

```bash
git add src/lib/historico.ts && git commit -m "feat: add append-only historico service layer"
```

- [ ] **Step 6: Commit `src/lib/historico.test.ts`**

```bash
git add src/lib/historico.test.ts && git commit -m "test: add historico service tests"
```

---

## Task 9: Advogado (admin) service layer

**Files:**
- Create: `src/lib/advogados.ts`
- Create: `src/lib/advogados.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `hashPassword` (Task 4), `advogadoSchema`/`AdvogadoInput` (Task 5), `resetDb`/`makeAdvogado` (Task 3).
- Produces: `createAdvogado(actorId, input): Promise<Advogado>`, `listAdvogados(actorId): Promise<Pick<Advogado, "id"|"nome"|"email"|"isAdmin"|"ativo"|"criadoEm">[]>`, `setAdvogadoAtivo(actorId, advogadoId, ativo): Promise<Advogado>`, `NaoAutorizadoError`.

- [ ] **Step 1: Write the failing test `src/lib/advogados.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeAdvogado } from "./testHelpers";
import { verifyPassword } from "./password";
import {
  createAdvogado,
  listAdvogados,
  setAdvogadoAtivo,
  NaoAutorizadoError,
} from "./advogados";

describe("advogados (admin) service", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("admin consegue criar um novo advogado com senha com hash", async () => {
    const admin = await makeAdvogado({ isAdmin: true });

    const novo = await createAdvogado(admin.id, {
      nome: "Dr. Fulano",
      email: "fulano@escritorio.com",
      senha: "senha1234",
    });

    expect(novo.senhaHash).not.toBe("senha1234");
    expect(await verifyPassword("senha1234", novo.senhaHash)).toBe(true);
  });

  it("não-admin não consegue criar advogado", async () => {
    const naoAdmin = await makeAdvogado({ isAdmin: false });

    await expect(
      createAdvogado(naoAdmin.id, {
        nome: "Dr. Fulano",
        email: "fulano@escritorio.com",
        senha: "senha1234",
      })
    ).rejects.toBeInstanceOf(NaoAutorizadoError);
  });

  it("não-admin não consegue listar advogados", async () => {
    const naoAdmin = await makeAdvogado({ isAdmin: false });
    await expect(listAdvogados(naoAdmin.id)).rejects.toBeInstanceOf(NaoAutorizadoError);
  });

  it("listAdvogados não expõe o hash da senha", async () => {
    const admin = await makeAdvogado({ isAdmin: true });
    const lista = await listAdvogados(admin.id);
    expect(lista[0]).not.toHaveProperty("senhaHash");
  });

  it("admin consegue desativar um advogado", async () => {
    const admin = await makeAdvogado({ isAdmin: true });
    const outro = await makeAdvogado({ ativo: true });

    const atualizado = await setAdvogadoAtivo(admin.id, outro.id, false);
    expect(atualizado.ativo).toBe(false);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm test -- advogados`
Expected: FAIL — `src/lib/advogados.ts` does not exist.

- [ ] **Step 3: Write `src/lib/advogados.ts`**

```ts
import { prisma } from "./db";
import { hashPassword } from "./password";
import { advogadoSchema, type AdvogadoInput } from "./validation";

export class NaoAutorizadoError extends Error {
  constructor() {
    super("Apenas administradores podem gerenciar contas de advogados.");
    this.name = "NaoAutorizadoError";
  }
}

async function assertIsAdmin(actorId: string) {
  const actor = await prisma.advogado.findUnique({ where: { id: actorId } });
  if (!actor?.isAdmin) throw new NaoAutorizadoError();
}

export async function createAdvogado(actorId: string, input: AdvogadoInput) {
  await assertIsAdmin(actorId);
  const data = advogadoSchema.parse(input);
  const senhaHash = await hashPassword(data.senha);

  return prisma.advogado.create({
    data: {
      nome: data.nome,
      email: data.email,
      senhaHash,
      isAdmin: data.isAdmin ?? false,
    },
  });
}

export async function listAdvogados(actorId: string) {
  await assertIsAdmin(actorId);
  return prisma.advogado.findMany({
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      email: true,
      isAdmin: true,
      ativo: true,
      criadoEm: true,
    },
  });
}

export async function setAdvogadoAtivo(
  actorId: string,
  advogadoId: string,
  ativo: boolean
) {
  await assertIsAdmin(actorId);
  return prisma.advogado.update({ where: { id: advogadoId }, data: { ativo } });
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `npm test -- advogados`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit `src/lib/advogados.ts`**

```bash
git add src/lib/advogados.ts && git commit -m "feat: add admin-only advogado management service"
```

- [ ] **Step 6: Commit `src/lib/advogados.test.ts`**

```bash
git add src/lib/advogados.test.ts && git commit -m "test: add advogado admin service tests"
```

---

## Task 10: Seed script (initial admin)

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json`, `package-lock.json` (add `tsx`, prisma seed config)

**Interfaces:**
- Consumes: `hashPassword` (Task 4).

- [ ] **Step 1: Install tsx**

```bash
npm install -D tsx
```

- [ ] **Step 2: Add prisma seed config to `package.json`**

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

- [ ] **Step 3: Commit `package.json`**

```bash
git add package.json && git commit -m "chore: add tsx and prisma seed config"
```

- [ ] **Step 4: Commit `package-lock.json`**

```bash
git add package-lock.json && git commit -m "chore: update package-lock for tsx"
```

- [ ] **Step 5: Write `prisma/seed.ts`**

```ts
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const nome = process.env.SEED_ADMIN_NOME ?? "Administrador";

  if (!email || !password) {
    throw new Error(
      "Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD antes de rodar o seed."
    );
  }

  const existing = await prisma.advogado.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} já existe, nada a fazer.`);
    return;
  }

  const senhaHash = await hashPassword(password);
  await prisma.advogado.create({
    data: { nome, email, senhaHash, isAdmin: true, ativo: true },
  });

  console.log(`Admin ${email} criado com sucesso.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 6: Commit `prisma/seed.ts`**

```bash
git add prisma/seed.ts && git commit -m "feat: add initial admin seed script"
```

- [ ] **Step 7: Verify manually**

```bash
SEED_ADMIN_EMAIL=admin@escritorio.com SEED_ADMIN_PASSWORD=senha12345678 npx prisma db seed
SEED_ADMIN_EMAIL=admin@escritorio.com SEED_ADMIN_PASSWORD=senha12345678 npx prisma db seed
```

Expected: first run prints `Admin admin@escritorio.com criado com sucesso.`; second run prints `Admin admin@escritorio.com já existe, nada a fazer.` (idempotent). A seed script is operational glue, not business logic, so manual verification is sufficient here — the business rules it exercises (`hashPassword`) are already unit-tested in Task 4.

---

## Task 11: Auth.js — credentials verification, session, middleware, login page

**Files:**
- Create: `src/lib/credentials.ts`
- Create: `src/lib/credentials.test.ts`
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `middleware.ts`
- Create: `src/app/actions/auth.ts`
- Create: `src/app/login/page.tsx`
- Modify: `package.json`, `package-lock.json` (add `next-auth@beta`)

**Interfaces:**
- Consumes: `prisma` (Task 2), `verifyPassword` (Task 4), `resetDb`/`makeAdvogado` (Task 3), `hashPassword` (Task 4).
- Produces: `verifyCredentials(email, password): Promise<{id, nome, email, isAdmin} | null>` from `src/lib/credentials.ts`; `auth`, `signIn`, `signOut`, `handlers` from `src/lib/auth.ts`; `loginAction`, `signOutAction` from `src/app/actions/auth.ts` (used by every UI task from here on to get the current session via `auth()`).

- [ ] **Step 1: Install next-auth**

```bash
npm install next-auth@beta
```

- [ ] **Step 2: Commit `package.json`**

```bash
git add package.json && git commit -m "chore: add next-auth dependency"
```

- [ ] **Step 3: Commit `package-lock.json`**

```bash
git add package-lock.json && git commit -m "chore: update package-lock for next-auth"
```

- [ ] **Step 4: Generate `AUTH_SECRET` for local dev**

```bash
npx auth secret
```

This writes `AUTH_SECRET` into your local `.env` (untracked). Also add a placeholder line to `.env.test` since middleware/auth code runs during tests' module resolution: `AUTH_SECRET="test-secret-not-used-for-anything-real"` (already present from Task 2's `.env.test.example`, copy it over if you haven't).

- [ ] **Step 5: Write the failing test `src/lib/credentials.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeAdvogado } from "./testHelpers";
import { hashPassword } from "./password";
import { verifyCredentials } from "./credentials";

describe("verifyCredentials", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("retorna o advogado quando email e senha estão corretos", async () => {
    const senhaHash = await hashPassword("senha12345678");
    const advogado = await makeAdvogado({ email: "fulano@escritorio.com", senhaHash });

    const result = await verifyCredentials("fulano@escritorio.com", "senha12345678");
    expect(result?.id).toBe(advogado.id);
  });

  it("retorna null com senha errada", async () => {
    const senhaHash = await hashPassword("senha12345678");
    await makeAdvogado({ email: "fulano@escritorio.com", senhaHash });

    expect(await verifyCredentials("fulano@escritorio.com", "senha-errada")).toBeNull();
  });

  it("retorna null para email inexistente", async () => {
    expect(await verifyCredentials("ninguem@escritorio.com", "qualquer")).toBeNull();
  });

  it("retorna null para advogado inativo", async () => {
    const senhaHash = await hashPassword("senha12345678");
    await makeAdvogado({
      email: "inativo@escritorio.com",
      senhaHash,
      ativo: false,
    });

    expect(
      await verifyCredentials("inativo@escritorio.com", "senha12345678")
    ).toBeNull();
  });
});
```

- [ ] **Step 6: Run and verify it fails**

Run: `npm test -- credentials`
Expected: FAIL — `src/lib/credentials.ts` does not exist.

- [ ] **Step 7: Write `src/lib/credentials.ts`**

```ts
import { prisma } from "./db";
import { verifyPassword } from "./password";

export async function verifyCredentials(email: string, password: string) {
  const advogado = await prisma.advogado.findUnique({ where: { email } });
  if (!advogado || !advogado.ativo) return null;

  const valid = await verifyPassword(password, advogado.senhaHash);
  if (!valid) return null;

  return {
    id: advogado.id,
    nome: advogado.nome,
    email: advogado.email,
    isAdmin: advogado.isAdmin,
  };
}
```

- [ ] **Step 8: Run and verify it passes**

Run: `npm test -- credentials`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit `src/lib/credentials.ts`**

```bash
git add src/lib/credentials.ts && git commit -m "feat: add credentials verification"
```

- [ ] **Step 10: Commit `src/lib/credentials.test.ts`**

```bash
git add src/lib/credentials.test.ts && git commit -m "test: add credentials verification tests"
```

- [ ] **Step 11: Write `src/lib/auth.ts`**

```ts
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyCredentials } from "./credentials";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;
        return verifyCredentials(email, password);
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.isAdmin = (user as { isAdmin: boolean }).isAdmin;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.isAdmin = token.isAdmin as boolean;
      return session;
    },
  },
});
```

- [ ] **Step 12: Commit `src/lib/auth.ts`**

```bash
git add src/lib/auth.ts && git commit -m "feat: configure next-auth credentials provider"
```

- [ ] **Step 13: Write `src/app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 14: Commit `src/app/api/auth/[...nextauth]/route.ts`**

```bash
git add "src/app/api/auth/[...nextauth]/route.ts" && git commit -m "feat: mount next-auth route handlers"
```

- [ ] **Step 15: Write `middleware.ts`** (project root)

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 16: Commit `middleware.ts`**

```bash
git add middleware.ts && git commit -m "feat: protect all routes except login behind auth middleware"
```

- [ ] **Step 17: Write `src/app/actions/auth.ts`**

```ts
"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";

export async function loginAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/clientes",
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "E-mail ou senha inválidos." };
    }
    throw err;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
```

- [ ] **Step 18: Commit `src/app/actions/auth.ts`**

```bash
git add src/app/actions/auth.ts && git commit -m "feat: add login and sign-out server actions"
```

- [ ] **Step 19: Write `src/app/login/page.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, {});

  return (
    <main>
      <h1>Entrar</h1>
      <form action={formAction}>
        <label>
          E-mail
          <input type="email" name="email" required />
        </label>
        <label>
          Senha
          <input type="password" name="password" required />
        </label>
        {state?.error && <p role="alert">{state.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 20: Commit `src/app/login/page.tsx`**

```bash
git add src/app/login/page.tsx && git commit -m "feat: add login page"
```

- [ ] **Step 21: Verify manually**

```bash
npm run dev
```

Visit `http://localhost:3000/clientes` while logged out → expect redirect to `/login`. Log in with the seeded admin's e-mail/password from Task 10 → expect redirect to `/clientes` (a 404 page is fine here, that route doesn't exist until Task 12 — the important thing is you land there authenticated, not bounced back to `/login`).

---

## Task 12: Cliente UI pages

**Files:**
- Create: `src/app/actions/clientes.ts`
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/app/(dashboard)/clientes/page.tsx`
- Create: `src/app/(dashboard)/clientes/novo/page.tsx`
- Create: `src/app/(dashboard)/clientes/[id]/page.tsx`
- Create: `src/app/(dashboard)/clientes/[id]/editar/page.tsx`
- Create: `src/app/(dashboard)/clientes/[id]/editar/form.tsx`

**Interfaces:**
- Consumes: `auth` (Task 11), `signOutAction` (Task 11), `createCliente`/`updateCliente`/`listClientesByAdvogado`/`getClienteForAdvogado`/`TelefoneDuplicadoError` (Task 6), `listProcessosByCliente` (Task 7).

- [ ] **Step 1: Write `src/app/actions/clientes.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createCliente, updateCliente, TelefoneDuplicadoError } from "@/lib/clientes";

function isValidationError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "issues" in err;
}

export async function createClienteAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  try {
    const cliente = await createCliente(session.user.id, {
      nome: String(formData.get("nome") ?? ""),
      telefone: String(formData.get("telefone") ?? ""),
      cpf: String(formData.get("cpf") ?? ""),
    });
    revalidatePath("/clientes");
    redirect(`/clientes/${cliente.id}`);
  } catch (err) {
    if (err instanceof TelefoneDuplicadoError) return { error: err.message };
    if (isValidationError(err)) {
      return { error: "Dados inválidos. Confira nome, telefone e CPF." };
    }
    throw err;
  }
}

export async function updateClienteAction(
  clienteId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  try {
    const result = await updateCliente(session.user.id, clienteId, {
      nome: String(formData.get("nome") ?? ""),
      telefone: String(formData.get("telefone") ?? ""),
      cpf: String(formData.get("cpf") ?? ""),
    });
    if (!result) return { error: "Cliente não encontrado." };

    revalidatePath("/clientes");
    revalidatePath(`/clientes/${clienteId}`);
    redirect(`/clientes/${clienteId}`);
  } catch (err) {
    if (err instanceof TelefoneDuplicadoError) return { error: err.message };
    if (isValidationError(err)) {
      return { error: "Dados inválidos. Confira nome, telefone e CPF." };
    }
    throw err;
  }
}
```

- [ ] **Step 2: Commit `src/app/actions/clientes.ts`**

```bash
git add src/app/actions/clientes.ts && git commit -m "feat: add cliente server actions"
```

- [ ] **Step 3: Write `src/app/(dashboard)/layout.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/app/actions/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <nav>
        <Link href="/clientes">Clientes</Link>
        {session.user.isAdmin && <Link href="/admin/advogados">Advogados</Link>}
        <form action={signOutAction}>
          <button type="submit">Sair</button>
        </form>
      </nav>
      <main>{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Commit `src/app/(dashboard)/layout.tsx`**

```bash
git add "src/app/(dashboard)/layout.tsx" && git commit -m "feat: add dashboard layout with nav and sign-out"
```

- [ ] **Step 5: Write `src/app/(dashboard)/clientes/page.tsx`**

```tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { listClientesByAdvogado } from "@/lib/clientes";

export default async function ClientesPage() {
  const session = await auth();
  const clientes = await listClientesByAdvogado(session!.user.id);

  return (
    <div>
      <h1>Clientes</h1>
      <Link href="/clientes/novo">Novo cliente</Link>
      <ul>
        {clientes.map((c) => (
          <li key={c.id}>
            <Link href={`/clientes/${c.id}`}>{c.nome}</Link> — {c.telefone}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Commit `src/app/(dashboard)/clientes/page.tsx`**

```bash
git add "src/app/(dashboard)/clientes/page.tsx" && git commit -m "feat: add clientes list page"
```

- [ ] **Step 7: Write `src/app/(dashboard)/clientes/novo/page.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { createClienteAction } from "@/app/actions/clientes";

export default function NovoClientePage() {
  const [state, formAction, pending] = useActionState(createClienteAction, {});

  return (
    <div>
      <h1>Novo cliente</h1>
      <form action={formAction}>
        <label>
          Nome
          <input name="nome" required />
        </label>
        <label>
          Telefone (formato +5511999999999)
          <input name="telefone" required />
        </label>
        <label>
          CPF
          <input name="cpf" required />
        </label>
        {state?.error && <p role="alert">{state.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 8: Commit `src/app/(dashboard)/clientes/novo/page.tsx`**

```bash
git add "src/app/(dashboard)/clientes/novo/page.tsx" && git commit -m "feat: add new cliente form page"
```

- [ ] **Step 9: Write `src/app/(dashboard)/clientes/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getClienteForAdvogado } from "@/lib/clientes";
import { listProcessosByCliente } from "@/lib/processos";

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const cliente = await getClienteForAdvogado(session!.user.id, id);
  if (!cliente) notFound();

  const processos = await listProcessosByCliente(session!.user.id, id);

  return (
    <div>
      <h1>{cliente.nome}</h1>
      <p>Telefone: {cliente.telefone}</p>
      <p>CPF: {cliente.cpf}</p>
      <Link href={`/clientes/${cliente.id}/editar`}>Editar cliente</Link>

      <h2>Processos</h2>
      <Link href={`/clientes/${cliente.id}/processos/novo`}>Novo processo</Link>
      <ul>
        {processos?.map((p) => (
          <li key={p.id}>
            <Link href={`/processos/${p.id}`}>{p.numeroProcesso}</Link> —{" "}
            {p.statusAtual} ({p.situacao})
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 10: Commit `src/app/(dashboard)/clientes/[id]/page.tsx`**

```bash
git add "src/app/(dashboard)/clientes/[id]/page.tsx" && git commit -m "feat: add cliente detail page with processos list"
```

- [ ] **Step 11: Write `src/app/(dashboard)/clientes/[id]/editar/form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import type { Cliente } from "@prisma/client";
import { updateClienteAction } from "@/app/actions/clientes";

export function EditarClienteForm({ cliente }: { cliente: Cliente }) {
  const action = updateClienteAction.bind(null, cliente.id);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction}>
      <label>
        Nome
        <input name="nome" defaultValue={cliente.nome} required />
      </label>
      <label>
        Telefone
        <input name="telefone" defaultValue={cliente.telefone} required />
      </label>
      <label>
        CPF
        <input name="cpf" defaultValue={cliente.cpf} required />
      </label>
      {state?.error && <p role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
```

- [ ] **Step 12: Commit `src/app/(dashboard)/clientes/[id]/editar/form.tsx`**

```bash
git add "src/app/(dashboard)/clientes/[id]/editar/form.tsx" && git commit -m "feat: add cliente edit form component"
```

- [ ] **Step 13: Write `src/app/(dashboard)/clientes/[id]/editar/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getClienteForAdvogado } from "@/lib/clientes";
import { EditarClienteForm } from "./form";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const cliente = await getClienteForAdvogado(session!.user.id, id);
  if (!cliente) notFound();

  return <EditarClienteForm cliente={cliente} />;
}
```

- [ ] **Step 14: Commit `src/app/(dashboard)/clientes/[id]/editar/page.tsx`**

```bash
git add "src/app/(dashboard)/clientes/[id]/editar/page.tsx" && git commit -m "feat: add cliente edit page"
```

- [ ] **Step 15: Verify manually**

```bash
npm run dev
```

Logged in as the seeded admin: visit `/clientes` (empty list) → `/clientes/novo`, create a client with a valid CPF (`111.444.777-35`) and phone (`+5511999990000`) → expect redirect to the detail page showing the new client. Edit the client's name → expect the change to persist. Open a second browser profile, log in as a different advogado (create one directly in the DB via `npx prisma studio` for this check, or wait until Task 14's admin UI exists) and confirm the first advogado's client is not visible in their `/clientes` list.

---

## Task 13: Processo UI pages (including histórico)

**Files:**
- Create: `src/app/actions/processos.ts`
- Create: `src/app/(dashboard)/clientes/[id]/processos/novo/page.tsx`
- Create: `src/app/(dashboard)/processos/[id]/page.tsx`
- Create: `src/app/(dashboard)/processos/[id]/editar/form.tsx`
- Create: `src/app/(dashboard)/processos/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `auth` (Task 11), `createProcesso`/`updateProcesso`/`getProcessoForAdvogado`/`ClienteNaoEncontradoError` (Task 7), `addHistoricoStatus`/`listHistoricoForProcesso` (Task 8).

- [ ] **Step 1: Write `src/app/actions/processos.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createProcesso, updateProcesso, ClienteNaoEncontradoError } from "@/lib/processos";
import { addHistoricoStatus } from "@/lib/historico";

export async function createProcessoAction(
  clienteId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  try {
    const processo = await createProcesso(session.user.id, clienteId, {
      numeroProcesso: String(formData.get("numeroProcesso") ?? ""),
      descricao: String(formData.get("descricao") ?? ""),
      statusAtual: String(formData.get("statusAtual") ?? ""),
    });
    revalidatePath(`/clientes/${clienteId}`);
    redirect(`/processos/${processo.id}`);
  } catch (err) {
    if (err instanceof ClienteNaoEncontradoError) return { error: err.message };
    throw err;
  }
}

export async function updateProcessoAction(
  processoId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const situacao = formData.get("situacao") === "encerrado" ? "encerrado" : "ativo";
  const result = await updateProcesso(session.user.id, processoId, {
    numeroProcesso: String(formData.get("numeroProcesso") ?? ""),
    descricao: String(formData.get("descricao") ?? ""),
    situacao,
  });
  if (!result) return { error: "Processo não encontrado." };

  revalidatePath(`/processos/${processoId}`);
  redirect(`/processos/${processoId}`);
}

export async function addHistoricoAction(
  processoId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) return { error: "Descreva a atualização de status." };

  await addHistoricoStatus(session.user.id, processoId, texto);
  revalidatePath(`/processos/${processoId}`);
  return {};
}
```

- [ ] **Step 2: Commit `src/app/actions/processos.ts`**

```bash
git add src/app/actions/processos.ts && git commit -m "feat: add processo and historico server actions"
```

- [ ] **Step 3: Write `src/app/(dashboard)/clientes/[id]/processos/novo/page.tsx`**

```tsx
"use client";

import { use } from "react";
import { useActionState } from "react";
import { createProcessoAction } from "@/app/actions/processos";

export default function NovoProcessoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clienteId } = use(params);
  const action = createProcessoAction.bind(null, clienteId);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <div>
      <h1>Novo processo</h1>
      <form action={formAction}>
        <label>
          Número do processo
          <input name="numeroProcesso" required />
        </label>
        <label>
          Descrição
          <input name="descricao" required />
        </label>
        <label>
          Status inicial
          <input name="statusAtual" required />
        </label>
        {state?.error && <p role="alert">{state.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Commit `src/app/(dashboard)/clientes/[id]/processos/novo/page.tsx`**

```bash
git add "src/app/(dashboard)/clientes/[id]/processos/novo/page.tsx" && git commit -m "feat: add new processo form page"
```

- [ ] **Step 5: Write `src/app/(dashboard)/processos/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProcessoForAdvogado } from "@/lib/processos";
import { listHistoricoForProcesso } from "@/lib/historico";
import { AddHistoricoForm } from "./historico-form";

export default async function ProcessoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const processo = await getProcessoForAdvogado(session!.user.id, id);
  if (!processo) notFound();

  const historico = await listHistoricoForProcesso(session!.user.id, id);

  return (
    <div>
      <h1>{processo.numeroProcesso}</h1>
      <p>{processo.descricao}</p>
      <p>
        Status atual: {processo.statusAtual} ({processo.situacao})
      </p>

      <h2>Adicionar atualização</h2>
      <AddHistoricoForm processoId={processo.id} />

      <h2>Histórico</h2>
      <ul>
        {historico?.map((h) => (
          <li key={h.id}>
            {h.criadoEm.toLocaleString("pt-BR")} — {h.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Write `src/app/(dashboard)/processos/[id]/historico-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { addHistoricoAction } from "@/app/actions/processos";

export function AddHistoricoForm({ processoId }: { processoId: string }) {
  const action = addHistoricoAction.bind(null, processoId);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction}>
      <label>
        Nova atualização de status
        <textarea name="texto" required />
      </label>
      {state?.error && <p role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Adicionar"}
      </button>
    </form>
  );
}
```

- [ ] **Step 7: Commit `src/app/(dashboard)/processos/[id]/historico-form.tsx`**

```bash
git add "src/app/(dashboard)/processos/[id]/historico-form.tsx" && git commit -m "feat: add historico entry form component"
```

- [ ] **Step 8: Commit `src/app/(dashboard)/processos/[id]/page.tsx`**

```bash
git add "src/app/(dashboard)/processos/[id]/page.tsx" && git commit -m "feat: add processo detail page with historico timeline"
```

- [ ] **Step 9: Write `src/app/(dashboard)/processos/[id]/editar/form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import type { Processo } from "@prisma/client";
import { updateProcessoAction } from "@/app/actions/processos";

export function EditarProcessoForm({ processo }: { processo: Processo }) {
  const action = updateProcessoAction.bind(null, processo.id);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction}>
      <label>
        Número do processo
        <input name="numeroProcesso" defaultValue={processo.numeroProcesso} required />
      </label>
      <label>
        Descrição
        <input name="descricao" defaultValue={processo.descricao} required />
      </label>
      <label>
        Situação
        <select name="situacao" defaultValue={processo.situacao}>
          <option value="ativo">Ativo</option>
          <option value="encerrado">Encerrado</option>
        </select>
      </label>
      {state?.error && <p role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
```

- [ ] **Step 10: Commit `src/app/(dashboard)/processos/[id]/editar/form.tsx`**

```bash
git add "src/app/(dashboard)/processos/[id]/editar/form.tsx" && git commit -m "feat: add processo edit form component"
```

- [ ] **Step 11: Write `src/app/(dashboard)/processos/[id]/editar/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProcessoForAdvogado } from "@/lib/processos";
import { EditarProcessoForm } from "./form";

export default async function EditarProcessoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const processo = await getProcessoForAdvogado(session!.user.id, id);
  if (!processo) notFound();

  return <EditarProcessoForm processo={processo} />;
}
```

- [ ] **Step 12: Commit `src/app/(dashboard)/processos/[id]/editar/page.tsx`**

```bash
git add "src/app/(dashboard)/processos/[id]/editar/page.tsx" && git commit -m "feat: add processo edit page"
```

- [ ] **Step 13: Verify manually**

```bash
npm run dev
```

From a client's detail page, create a processo → land on its detail page. Add a status update via the "Adicionar" form → confirm it appears in the histórico list and `statusAtual` at the top updates. Edit the processo, set situação to "encerrado" → confirm it shows as encerrado and the histórico is untouched (still has the earlier entries).

---

## Task 14: Admin UI pages (manage advogado accounts)

**Files:**
- Create: `src/app/actions/advogados.ts`
- Create: `src/app/(dashboard)/admin/layout.tsx`
- Create: `src/app/(dashboard)/admin/advogados/page.tsx`
- Create: `src/app/(dashboard)/admin/advogados/novo/page.tsx`

**Interfaces:**
- Consumes: `auth` (Task 11), `createAdvogado`/`listAdvogados`/`setAdvogadoAtivo`/`NaoAutorizadoError` (Task 9).

- [ ] **Step 1: Write `src/app/actions/advogados.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdvogado, setAdvogadoAtivo, NaoAutorizadoError } from "@/lib/advogados";

function isValidationError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "issues" in err;
}

export async function createAdvogadoAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  try {
    await createAdvogado(session.user.id, {
      nome: String(formData.get("nome") ?? ""),
      email: String(formData.get("email") ?? ""),
      senha: String(formData.get("senha") ?? ""),
      isAdmin: formData.get("isAdmin") === "on",
    });
    revalidatePath("/admin/advogados");
    redirect("/admin/advogados");
  } catch (err) {
    if (err instanceof NaoAutorizadoError) return { error: err.message };
    if (isValidationError(err)) {
      return { error: "Dados inválidos. Confira nome, e-mail e senha (mín. 8 caracteres)." };
    }
    throw err;
  }
}

export async function toggleAdvogadoAtivoAction(advogadoId: string, ativo: boolean) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await setAdvogadoAtivo(session.user.id, advogadoId, ativo);
  revalidatePath("/admin/advogados");
}
```

- [ ] **Step 2: Commit `src/app/actions/advogados.ts`**

```bash
git add src/app/actions/advogados.ts && git commit -m "feat: add admin advogado management server actions"
```

- [ ] **Step 3: Write `src/app/(dashboard)/admin/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/clientes");

  return <>{children}</>;
}
```

- [ ] **Step 4: Commit `src/app/(dashboard)/admin/layout.tsx`**

```bash
git add "src/app/(dashboard)/admin/layout.tsx" && git commit -m "feat: guard admin routes behind is_admin"
```

- [ ] **Step 5: Write `src/app/(dashboard)/admin/advogados/page.tsx`**

```tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { listAdvogados } from "@/lib/advogados";
import { toggleAdvogadoAtivoAction } from "@/app/actions/advogados";

export default async function AdvogadosPage() {
  const session = await auth();
  const advogados = await listAdvogados(session!.user.id);

  return (
    <div>
      <h1>Advogados</h1>
      <Link href="/admin/advogados/novo">Novo advogado</Link>
      <ul>
        {advogados.map((a) => (
          <li key={a.id}>
            {a.nome} — {a.email} — {a.ativo ? "ativo" : "inativo"}
            <form
              action={async () => {
                "use server";
                await toggleAdvogadoAtivoAction(a.id, !a.ativo);
              }}
            >
              <button type="submit">{a.ativo ? "Desativar" : "Ativar"}</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Commit `src/app/(dashboard)/admin/advogados/page.tsx`**

```bash
git add "src/app/(dashboard)/admin/advogados/page.tsx" && git commit -m "feat: add advogados admin list page"
```

- [ ] **Step 7: Write `src/app/(dashboard)/admin/advogados/novo/page.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { createAdvogadoAction } from "@/app/actions/advogados";

export default function NovoAdvogadoPage() {
  const [state, formAction, pending] = useActionState(createAdvogadoAction, {});

  return (
    <div>
      <h1>Novo advogado</h1>
      <form action={formAction}>
        <label>
          Nome
          <input name="nome" required />
        </label>
        <label>
          E-mail
          <input type="email" name="email" required />
        </label>
        <label>
          Senha inicial
          <input type="password" name="senha" required minLength={8} />
        </label>
        <label>
          <input type="checkbox" name="isAdmin" /> É administrador
        </label>
        {state?.error && <p role="alert">{state.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 8: Commit `src/app/(dashboard)/admin/advogados/novo/page.tsx`**

```bash
git add "src/app/(dashboard)/admin/advogados/novo/page.tsx" && git commit -m "feat: add new advogado form page"
```

- [ ] **Step 9: Verify manually**

```bash
npm run dev
```

Logged in as the seeded admin, visit `/admin/advogados` → see the seeded admin listed. Create a new advogado (not admin) → log out, log in as the new advogado → confirm `/admin/advogados` redirects to `/clientes` (not authorized). Log back in as the original admin, click "Desativar" on the new advogado, then try logging in as that advogado → expect login to fail (inactive accounts can't authenticate, per Task 11's `verifyCredentials`).

---

## Task 15: Deployment config for Coolify

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `next.config.ts` (enable standalone output)

**Interfaces:**
- Consumes: nothing new — packages the app built by all previous tasks.

- [ ] **Step 1: Enable standalone output in `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 2: Commit `next.config.ts`**

```bash
git add next.config.ts && git commit -m "feat: enable standalone output for docker deployment"
```

- [ ] **Step 3: Write `Dockerfile`**

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 4: Commit `Dockerfile`**

```bash
git add Dockerfile && git commit -m "feat: add production Dockerfile"
```

- [ ] **Step 5: Write `.dockerignore`**

```
node_modules
.next
.git
.env
.env.test
```

- [ ] **Step 6: Commit `.dockerignore`**

```bash
git add .dockerignore && git commit -m "chore: add dockerignore"
```

- [ ] **Step 7: Verify**

If Docker is available locally:

```bash
docker build -t iaparaadvogados .
```

Expected: image builds successfully. If Docker isn't available locally, at minimum confirm `npm run build` still succeeds with `output: "standalone"` set — the Coolify deploy will validate the actual Docker build.

**Deployment steps in Coolify (manual, not part of this codebase):**
1. Create a PostgreSQL resource in Coolify; note its internal connection string.
2. Create a new application pointing at this git repository, build pack = Dockerfile.
3. Set env vars on the application: `DATABASE_URL` (pointing at the Coolify Postgres resource), `AUTH_SECRET` (generate with `npx auth secret`).
4. Add a post-deployment command: `npx prisma migrate deploy`.
5. Deploy, then run the seed once via Coolify's terminal/exec on the running container: `SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npx prisma db seed`.

---

## Final verification

- [ ] Run the full test suite: `npm test` — expect all tests across Tasks 3–11 to pass (password, validation, clientes, processos, historico, advogados, credentials, testHelpers).
- [ ] Run `npm run build` — expect a clean production build.
- [ ] Walk through the manual verification steps from Tasks 11–14 end to end in one session: login → create cliente → create processo → add histórico entry → encerrar processo → admin creates/deactivates an advogado account.
