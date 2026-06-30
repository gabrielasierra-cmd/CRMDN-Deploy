import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { PricingMode, DetectedDivision } from "./video-quotes.pricing";

interface FrameSample {
  path: string;
  dataUrl: string;
  timestamp: number;
}

export interface VideoAnalysisInput {
  videoPath: string;
  pricingMode: PricingMode;
  tipologia?: string;
  clientName?: string;
  notes?: string;
}

export interface VideoAnalysisResult {
  divisoes: DetectedDivision[];
  reviewRequired: boolean;
  observations: string[];
  raw: unknown;
}

function runBinary(binary: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `Process failed with code ${code}`));
    });
  });
}

async function probeDurationSeconds(videoPath: string): Promise<number> {
  const probePath = ffprobeStatic.path;
  if (!probePath) {
    throw new Error("FFPROBE_NOT_AVAILABLE");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      probePath,
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffprobe failed with code ${code}`));
        return;
      }
      const duration = Number(stdout.trim());
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Unable to determine video duration."));
        return;
      }
      resolve(duration);
    });
  });
}

async function extractFrames(videoPath: string, sampleCount: number): Promise<FrameSample[]> {
  if (!ffmpegPath) {
    throw new Error("FFMPEG_NOT_AVAILABLE");
  }

  const duration = await probeDurationSeconds(videoPath);
  const frameCount = Math.max(4, Math.min(sampleCount, 8));
  const timestamps = Array.from({ length: frameCount }, (_value, index) => {
    const ratio = (index + 1) / (frameCount + 1);
    return Math.max(0.5, Number((duration * ratio).toFixed(2)));
  });

  const tempDir = path.join(path.dirname(videoPath), `frames-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const samples: FrameSample[] = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      const framePath = path.join(tempDir, `frame-${String(i + 1).padStart(2, "0")}.jpg`);
      await runBinary(ffmpegPath, [
        "-y",
        "-ss",
        String(timestamps[i]),
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-q:v",
        "4",
        framePath
      ]);

      const buffer = await fs.readFile(framePath);
      samples.push({
        path: framePath,
        timestamp: timestamps[i],
        dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`
      });
    }

    return samples;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function extractTextFromResponse(payload: any): string {
  if (!payload) return "";
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (Array.isArray(payload.output)) {
    const parts: string[] = [];
    payload.output.forEach((item: any) => {
      if (!item || !Array.isArray(item.content)) return;
      item.content.forEach((content: any) => {
        if (!content) return;
        if (typeof content.text === "string") parts.push(content.text);
        if (typeof content.output_text === "string") parts.push(content.output_text);
        if (typeof content.value === "string") parts.push(content.value);
      });
    });
    return parts.join("\n").trim();
  }

  return "";
}

function parseAnalysisPayload(rawText: string): {
  divisoes: DetectedDivision[];
  reviewRequired?: boolean;
  observations?: string[];
} {
  const trimmed = String(rawText || "").trim();
  const jsonBlock = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonBlock) {
    throw new Error("AI_JSON_NOT_FOUND");
  }

  const parsed = JSON.parse(jsonBlock[0]);
  if (!Array.isArray(parsed.divisoes)) {
    throw new Error("AI_JSON_INVALID");
  }

  return parsed;
}

function fallbackAnalysis(input: VideoAnalysisInput): VideoAnalysisResult {
  const baseDivision: DetectedDivision = {
    tipo: input.pricingMode === "restaurante" ? "Sala" : input.pricingMode === "escritorio" ? "Escritorio" : "Sala",
    nivel_sujidade: "Médio",
    tamanho: "Médio",
    itens_detectados: [],
    observacoes: input.notes || "Analise automatica sem visao por IA."
  };

  if (input.pricingMode === "tipologia" && input.tipologia === "t4") {
    return {
      divisoes: [baseDivision],
      reviewRequired: true,
      observations: ["Sem chave OpenAI configurada. T4 requer revisao manual."],
      raw: { source: "fallback", reason: "OPENAI_API_KEY_NOT_CONFIGURED" }
    };
  }

  return {
    divisoes: [baseDivision],
    reviewRequired: true,
    observations: ["Sem chave OpenAI configurada. Orçamento gerado com análise interna e marcado para revisão."],
    raw: { source: "fallback", reason: "OPENAI_API_KEY_NOT_CONFIGURED" }
  };
}

export async function analisarVideo(
  input: VideoAnalysisInput,
  options: {
    apiKey?: string;
    model: string;
    sampleCount: number;
  }
): Promise<VideoAnalysisResult> {
  if (!options.apiKey) {
    return fallbackAnalysis(input);
  }

  const samples = await extractFrames(input.videoPath, options.sampleCount);
  const prompt = [
    "Analisa o vídeo frame a frame e devolve APENAS JSON válido.",
    "Nao inventes valores monetarios.",
    "Identifica as divisoes visiveis e, para cada uma, devolve:",
    "- tipo",
    "- nivel_sujidade (Baixo, Medio, Alto)",
    "- tamanho (Pequeno, Medio, Grande)",
    "- itens_detectados (array de strings)",
    "- observacoes (opcional)",
    "",
    "Se vires sinais claros de analise obrigatoria, define reviewRequired como true.",
    "Se a entrada sugerir tipos especiais, adiciona observations mas nao calcules preco.",
    "",
    "Formato esperado:",
    "{",
    '  "divisoes": [',
    '    {"tipo":"Cozinha","nivel_sujidade":"Alto","tamanho":"Medio","itens_detectados":["Armarios","Fogao"],"observacoes":"..."}',
    "  ],",
    '  "reviewRequired": false,',
    '  "observations": ["..."]',
    "}"
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: options.model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            ...samples.map((frame) => ({
              type: "input_image",
              image_url: frame.dataUrl
            }))
          ]
        }
      ]
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : "AI_REQUEST_FAILED";
    throw new Error(message);
  }

  const rawText = extractTextFromResponse(payload);
  const parsed = parseAnalysisPayload(rawText);

  return {
    divisoes: parsed.divisoes,
    reviewRequired: Boolean(parsed.reviewRequired),
    observations: Array.isArray(parsed.observations) ? parsed.observations.map((item) => String(item)) : [],
    raw: payload
  };
}
