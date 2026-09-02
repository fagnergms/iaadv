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
  cpf: z
    .string()
    .trim()
    .refine(isValidCPF, "CPF inválido")
    // Normaliza para 11 dígitos só depois de validar, para que a Fase 2 consiga
    // casar clientes por CPF sem depender da formatação digitada.
    .transform((cpf) => cpf.replace(/\D/g, "")),
});

export type ClienteInput = z.infer<typeof clienteSchema>;

export const advogadoSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório"),
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  isAdmin: z.boolean().optional(),
});

export type AdvogadoInput = z.infer<typeof advogadoSchema>;

export const processoSchema = z.object({
  numeroProcesso: z.string().trim().min(1, "Número do processo é obrigatório"),
  descricao: z.string().trim().min(1, "Descrição é obrigatória"),
  statusAtual: z.string().trim().min(1, "Status atual é obrigatório"),
});

export type ProcessoInput = z.infer<typeof processoSchema>;
