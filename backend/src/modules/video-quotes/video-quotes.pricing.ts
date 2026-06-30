export type PricingMode = "divisoes" | "tipologia" | "pos_obra" | "restaurante" | "escritorio";
export type TipologiaMode = "t0_t1_t2_normal" | "t0_t1_t2_profunda" | "t3" | "t4";

export interface DetectedDivision {
  tipo: string;
  nivel_sujidade: "Baixo" | "Médio" | "Alto";
  tamanho: "Pequeno" | "Médio" | "Grande";
  itens_detectados: string[];
  observacoes?: string;
}

export interface QuoteContext {
  pricingMode: PricingMode;
  tipologia?: TipologiaMode;
  hours?: number;
  workers?: number;
  areaM2?: number;
  floors?: number;
}

export interface PricedDivision extends DetectedDivision {
  valor_base: number;
  valor_estimado: number;
  extras_detectados: number;
}

export interface PricingResult {
  divisoes: PricedDivision[];
  total_estimado: number;
  reviewRequired: boolean;
  notes: string[];
  summary: Record<string, unknown>;
}

const BASE_PRICES: Record<string, number> = {
  cozinha: 35,
  wc: 20,
  sala: 25,
  quarto: 20,
  corredor: 10,
  varanda: 15
};

const EXTRA_ITEM_KEYWORDS = [
  "janela",
  "armario",
  "armário",
  "eletrodom",
  "fogao",
  "fogão",
  "forno",
  "exaustor",
  "frigorif",
  "microondas",
  "micro-ondas",
  "maquina",
  "máquina",
  "porta",
  "rodape",
  "rodapé",
  "espelho",
  "vidro",
  "persiana",
  "estore"
];

function roundMoney(value: number): number {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeText(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeDivisionType(value: string): string {
  const text = normalizeText(value);
  if (text.includes("cozinha")) return "cozinha";
  if (text.includes("wc") || text.includes("casa de banho") || text.includes("banheiro")) return "wc";
  if (text.includes("sala")) return "sala";
  if (text.includes("quarto")) return "quarto";
  if (text.includes("corred")) return "corredor";
  if (text.includes("varand")) return "varanda";
  return text || "sala";
}

function countExtraItems(items: string[]): number {
  return items.reduce((count, item) => {
    const normalized = normalizeText(item);
    return count + (EXTRA_ITEM_KEYWORDS.some((keyword) => normalized.includes(keyword)) ? 1 : 0);
  }, 0);
}

function sizeMultiplier(size: DetectedDivision["tamanho"]): number {
  const normalized = normalizeText(size);
  if (normalized.includes("grande")) return 1.2;
  return 1;
}

function dirtMultiplier(level: DetectedDivision["nivel_sujidade"]): number {
  const normalized = normalizeText(level);
  if (normalized.includes("alto")) return 1.3;
  if (normalized.includes("medio")) return 1.15;
  return 1;
}

function scoreDivision(division: DetectedDivision): PricedDivision {
  const normalizedType = normalizeDivisionType(division.tipo);
  const basePrice = BASE_PRICES[normalizedType] ?? 0;
  const extrasDetected = countExtraItems(division.itens_detectados || []);
  const calculated = roundMoney((basePrice * dirtMultiplier(division.nivel_sujidade) * sizeMultiplier(division.tamanho)) + extrasDetected * 5);

  return {
    ...division,
    tipo: division.tipo,
    valor_base: basePrice,
    valor_estimado: calculated,
    extras_detectados: extrasDetected
  };
}

function sumDivisionPrices(divisoes: PricedDivision[]): number {
  return roundMoney(divisoes.reduce((acc, division) => acc + division.valor_estimado, 0));
}

export function calcularValores(
  divisions: DetectedDivision[],
  context: QuoteContext
): PricingResult {
  const divisoes = divisions.map(scoreDivision);
  const notes: string[] = [];
  let totalEstimado = sumDivisionPrices(divisoes);
  let reviewRequired = false;

  if (context.pricingMode === "pos_obra") {
    if (!Number.isFinite(Number(context.hours)) || !Number.isFinite(Number(context.workers))) {
      throw new Error("POST_OBRA_CONTEXT_REQUIRED");
    }
    totalEstimado = roundMoney(Number(context.hours) * Number(context.workers) * 20);
    notes.push("Preco de pos-obra calculado a 20€ por hora e por funcionario.");
  } else if (context.pricingMode === "restaurante") {
    totalEstimado = Math.max(totalEstimado, 600);
    notes.push("Aplicado minimo de 600€ para restaurante.");
  } else if (context.pricingMode === "escritorio") {
    if (Number.isFinite(Number(context.floors)) && Number(context.floors) > 0) {
      totalEstimado = Math.max(totalEstimado, roundMoney(Number(context.floors) * 400));
      notes.push("Aplicado valor por andar para escritorio.");
    } else if (Number.isFinite(Number(context.areaM2)) && Number(context.areaM2) > 0 && Number(context.areaM2) <= 25) {
      const complexity = Math.max(0, Math.min(1, totalEstimado / 185));
      totalEstimado = roundMoney(130 + complexity * 55);
      notes.push("Aplicado intervalo para escritorio ate 25m².");
    } else {
      reviewRequired = true;
      notes.push("Area ou numero de andares insuficiente para fechar o escritorio com rigor.");
    }
  } else if (context.pricingMode === "tipologia") {
    const tipologia = context.tipologia ?? "t0_t1_t2_normal";
    if (tipologia === "t4") {
      reviewRequired = true;
      totalEstimado = 0;
      notes.push("T4 requer analise obrigatoria.");
    } else if (tipologia === "t0_t1_t2_normal") {
      totalEstimado = 35;
    } else if (tipologia === "t0_t1_t2_profunda") {
      totalEstimado = 45;
    } else if (tipologia === "t3") {
      const complexity = divisoes.length ? divisoes.reduce((acc, item) => {
        const dirtyLevel = normalizeText(item.nivel_sujidade);
        const sizeLevel = normalizeText(item.tamanho);
        const dirty = dirtyLevel.includes("alto") ? 2 : dirtyLevel.includes("medio") ? 1 : 0;
        const size = sizeLevel.includes("grande") ? 2 : sizeLevel.includes("medio") ? 1 : 0;
        return acc + dirty + size + item.extras_detectados;
      }, 0) / divisoes.length : 0;
      totalEstimado = roundMoney(Math.max(55, Math.min(60, 55 + Math.min(5, Math.round(complexity)))));
    }
  }

  return {
    divisoes,
    total_estimado: roundMoney(totalEstimado),
    reviewRequired,
    notes,
    summary: {
      pricingMode: context.pricingMode,
      tipologia: context.tipologia ?? null,
      totalDivisoes: divisoes.length
    }
  };
}

export function needsManualReview(context: QuoteContext, result: PricingResult): boolean {
  return Boolean(result.reviewRequired || (context.pricingMode === "tipologia" && context.tipologia === "t4"));
}
