import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, BorderStyle, HeadingLevel } from "docx";
import { DetectedDivision } from "./video-quotes.pricing";

export interface QuoteDocumentInput {
  quoteNumber: string;
  createdAt: Date;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  serviceMode: string;
  divisionRows: Array<DetectedDivision & { valor_estimado: number }>;
  estimatedTotal: number;
  notes: string[];
}

export interface InvoiceDocumentInput {
  invoiceNumber: string;
  quoteNumber: string;
  createdAt: Date;
  clientName: string;
  serviceMode: string;
  estimatedTotal: number;
  vatRate: number;
  vatAmount: number;
  totalToPay: number;
}

const COMPANY = {
  name: "D&N Clean Solutions",
  iban: "PT50 0033 0000 45619092532 05",
  bank: "Millennium bcp",
  contacts: "934 772 607 | 934 592 791",
  email: "dncleansolution@gmail.com",
  responsables: "Dalila Herrera e Narai Herrera"
};

const ALIGNMENT_MAP = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT
} as const;

function money(value: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function textParagraph(text: string, options: { bold?: boolean; size?: number; align?: "left" | "center" | "right" } = {}) {
  return new Paragraph({
    alignment: options.align ? ALIGNMENT_MAP[options.align] : AlignmentType.LEFT,
    children: [new TextRun({ text, bold: options.bold, size: options.size ?? 22 })]
  });
}

function headerBlock(title: string, subtitle: string) {
  return [
    textParagraph(COMPANY.name, { bold: true, size: 28, align: "center" }),
    textParagraph(title, { bold: true, size: 24, align: "center" }),
    textParagraph(subtitle, { size: 18, align: "center" })
  ];
}

function companyBlock() {
  return [
    textParagraph(`IBAN: ${COMPANY.iban}`, { size: 18 }),
    textParagraph(`Banco: ${COMPANY.bank}`, { size: 18 }),
    textParagraph(`Responsaveis: ${COMPANY.responsables}`, { size: 18 }),
    textParagraph(`Contacto: ${COMPANY.contacts}`, { size: 18 }),
    textParagraph(`Email: ${COMPANY.email}`, { size: 18 })
  ];
}

function safe(value: string | null | undefined): string {
  return String(value || "-");
}

function buildDividerTable(rows: Array<DetectedDivision & { valor_estimado: number }>) {
  const header = new TableRow({
    children: ["#", "Divisao", "Sujidade", "Tamanho", "Itens detectados", "Valor"].map((label) =>
      new TableCell({
        width: { size: 16.6, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "053E78" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "053E78" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "053E78" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "053E78" }
        },
        shading: { fill: "053E78" },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: "FFFFFF", size: 18 })] })]
      })
    )
  });

  const body = rows.map((row, index) =>
    new TableRow({
      children: [
        `${index + 1}`,
        row.tipo,
        row.nivel_sujidade,
        row.tamanho,
        (row.itens_detectados || []).join(", ") || "-",
        money(row.valor_estimado)
      ].map((value) =>
        new TableCell({
          width: { size: 16.6, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: String(value), size: 18 })] })]
        })
      )
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...body]
  });
}

export async function generateQuoteDocument(input: QuoteDocumentInput): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          ...headerBlock("ORCAMENTO DE LIMPEZA PROFISSIONAL", `Orcamento ${input.quoteNumber} | ${input.createdAt.toLocaleDateString("pt-PT")}`),
          textParagraph(`Cliente: ${safe(input.clientName)}`, { bold: true, size: 20 }),
          textParagraph(`Email: ${safe(input.clientEmail)}`, { size: 18 }),
          textParagraph(`Telefone: ${safe(input.clientPhone)}`, { size: 18 }),
          textParagraph(`Modo de precificacao: ${input.serviceMode}`, { size: 18 }),
          new Paragraph(""),
          buildDividerTable(input.divisionRows),
          new Paragraph(""),
          textParagraph(`Total estimado: ${money(input.estimatedTotal)}`, { bold: true, size: 22 }),
          new Paragraph(""),
          textParagraph("Observacoes automáticas", { bold: true, size: 20 }),
          ...input.notes.map((note) => textParagraph(`- ${note}`, { size: 18 })),
          new Paragraph(""),
          textParagraph("Este documento foi gerado automaticamente atraves da analise de video.", { size: 18 }),
          textParagraph("Assinatura digital da empresa:", { bold: true, size: 18 }),
          ...companyBlock()
        ]
      }
    ]
  });

  return Packer.toBuffer(doc);
}

export async function generateInvoiceDocument(input: InvoiceDocumentInput): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          ...headerBlock("FATURA", `Fatura ${input.invoiceNumber} | Associada ao orcamento ${input.quoteNumber}`),
          textParagraph(`Cliente: ${safe(input.clientName)}`, { bold: true, size: 20 }),
          textParagraph(`Data: ${input.createdAt.toLocaleDateString("pt-PT")}`, { size: 18 }),
          textParagraph(`Modo de servico: ${input.serviceMode}`, { size: 18 }),
          new Paragraph(""),
          buildDividerTable([
            {
              tipo: "Servico de limpeza",
              nivel_sujidade: "-",
              tamanho: "-",
              itens_detectados: [input.serviceMode],
              valor_estimado: input.estimatedTotal
            } as unknown as DetectedDivision & { valor_estimado: number }
          ]),
          new Paragraph(""),
          textParagraph(`Subtotal: ${money(input.estimatedTotal)}`, { bold: true, size: 20 }),
          textParagraph(`IVA (${input.vatRate}%): ${money(input.vatAmount)}`, { size: 18 }),
          textParagraph(`Total final: ${money(input.totalToPay)}`, { bold: true, size: 22 }),
          new Paragraph(""),
          textParagraph(`IBAN: ${COMPANY.iban}`, { size: 18 }),
          textParagraph(`Banco: ${COMPANY.bank}`, { size: 18 }),
          textParagraph(`Responsaveis: ${COMPANY.responsables}`, { size: 18 }),
          textParagraph(`Contacto: ${COMPANY.contacts}`, { size: 18 }),
          textParagraph(`Email: ${COMPANY.email}`, { size: 18 })
        ]
      }
    ]
  });

  return Packer.toBuffer(doc);
}
