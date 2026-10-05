import type Tesseract from "tesseract.js";

// Leitura da CNH no próprio navegador (nada é enviado ao servidor para o OCR).
// Pensado para o modelo SENATRAN (CNH digital/PDF), cujo campo frontal fica num
// layout fixo; as áreas são frações da imagem frontal, por isso independem da resolução.

export type CnhImport = {
  nome?: string;
  cpf?: string;
  registro?: string;
  validade?: string;
  foto?: File;
};

type Box = { x: number; y: number; w: number; h: number };

const FIELDS: Record<"nome" | "validade" | "cpf" | "registro", { box: Box; whitelist: string; binarize: boolean }> = {
  nome: { box: { x: 0.175, y: 0.285, w: 0.6, h: 0.055 }, whitelist: "", binarize: false },
  validade: { box: { x: 0.635, y: 0.44, w: 0.14, h: 0.065 }, whitelist: "0123456789/", binarize: true },
  cpf: { box: { x: 0.45, y: 0.6, w: 0.2, h: 0.065 }, whitelist: "0123456789.-", binarize: true },
  registro: { box: { x: 0.655, y: 0.6, w: 0.18, h: 0.065 }, whitelist: "0123456789", binarize: true },
};

const FOTO_BOX: Box = { x: 0.177, y: 0.357, w: 0.255, h: 0.488 };
const CARD_RATIO = 1.36;

export async function lerCnh(file: File): Promise<CnhImport> {
  const front = file.type === "application/pdf" ? await frontalDoPdf(file) : await imagemParaCanvas(file);
  const textos = await ocrCampos(front);

  const nome = textos.nome?.replace(/^[^A-Za-zÀ-ÿ]+/, "").replace(/\s+/g, " ").trim();
  const cpf = textos.cpf?.match(/(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})/);
  const registro = textos.registro?.match(/\d{11}/);
  const validade = textos.validade?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const ano = validade ? Number(validade[3]) : 0;

  const foto = await recortar(front, FOTO_BOX, { tipo: "image/jpeg" });
  const fotoFile = foto ? new File([foto], "foto-cnh.jpg", { type: "image/jpeg" }) : undefined;

  const resultado: CnhImport = {
    nome: nome && nome.split(" ").length >= 2 ? nome : undefined,
    cpf: cpf ? `${cpf[1]}.${cpf[2]}.${cpf[3]}-${cpf[4]}` : undefined,
    registro: registro?.[0],
    validade: validade && ano >= 2000 && ano <= 2100 ? `${validade[3]}-${validade[2]}-${validade[1]}` : undefined,
    foto: fotoFile,
  };
  if (!resultado.nome && !resultado.cpf && !resultado.registro && !resultado.validade) {
    throw new Error("Não foi possível ler a CNH. Preencha os campos manualmente.");
  }
  return resultado;
}

async function frontalDoPdf(file: File): Promise<HTMLCanvasElement> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const tarefa = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await tarefa.promise;
  try {
    const page = await doc.getPage(1);
    const ops = await page.getOperatorList();
    const colocadas = imagensColocadas(ops, pdfjs.OPS);

    const frente = colocadas
      .filter((i) => i.w >= 150 && i.w / i.h >= CARD_RATIO - 0.2 && i.w / i.h <= CARD_RATIO + 0.2)
      .sort((a, b) => b.y - a.y)[0];
    if (!frente) throw new Error("Não foi encontrada a frente da CNH neste PDF.");

    const imagem = await new Promise<PdfImagem | null>((resolve) => page.objs.get(frente.nome, resolve));
    if (imagem?.bitmap) return bitmapParaCanvas(imagem.bitmap);
    if (!imagem?.data) throw new Error("Não foi possível extrair a imagem da CNH.");
    return pixelsParaCanvas({ width: imagem.width, height: imagem.height, data: imagem.data });
  } finally {
    await tarefa.destroy();
  }
}

type Colocada = { nome: string; w: number; h: number; x: number; y: number };

type PdfImagem = {
  width: number;
  height: number;
  data?: Uint8ClampedArray | Uint8Array | null;
  bitmap?: ImageBitmap | null;
};

function bitmapParaCanvas(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  return canvas;
}

function imagensColocadas(
  ops: { fnArray: number[]; argsArray: unknown[][] },
  OPS: Record<string, number>,
): Colocada[] {
  const mul = (a: number[], b: number[]) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  let ctm = [1, 0, 0, 1, 0, 0];
  const pilha: number[][] = [];
  const achadas: Colocada[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const f = ops.fnArray[i];
    const a = ops.argsArray[i];
    if (f === OPS.save) pilha.push([...ctm]);
    else if (f === OPS.restore) ctm = pilha.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (f === OPS.transform) ctm = mul(a as number[], ctm);
    else if (f === OPS.paintImageXObject) {
      achadas.push({ nome: String(a[0]), w: Math.abs(ctm[0]), h: Math.abs(ctm[3]), x: ctm[4], y: ctm[5] });
    }
  }
  return achadas;
}

async function imagemParaCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

function pixelsParaCanvas(img: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }): HTMLCanvasElement {
  const { width, height, data } = img;
  const canais = data.length / (width * height);
  if (canais !== 1 && canais !== 3 && canais !== 4) throw new Error("Formato de imagem da CNH não suportado.");
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, q = 0; p < width * height; p++, q += 4) {
    const base = p * canais;
    rgba[q] = data[base];
    rgba[q + 1] = canais === 1 ? data[base] : data[base + 1];
    rgba[q + 2] = canais === 1 ? data[base] : data[base + 2];
    rgba[q + 3] = canais === 4 ? data[base + 3] : 255;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

async function recortar(
  origem: HTMLCanvasElement,
  box: Box,
  { escala = 1, binarizar = false, margem = 0, tipo = "image/png" }: { escala?: number; binarizar?: boolean; margem?: number; tipo?: string } = {},
): Promise<Blob | null> {
  const sw = Math.round(box.w * origem.width);
  const sh = Math.round(box.h * origem.height);
  const canvas = document.createElement("canvas");
  canvas.width = sw * escala + margem * 2;
  canvas.height = sh * escala + margem * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(origem, box.x * origem.width, box.y * origem.height, sw, sh, margem, margem, sw * escala, sh * escala);
  if (binarizar) {
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = id.data[i + 1] < 140 ? 0 : 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    }
    ctx.putImageData(id, 0, 0);
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), tipo, 0.92));
}

async function ocrCampos(front: HTMLCanvasElement): Promise<Partial<Record<keyof typeof FIELDS, string>>> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/",
    langPath: "/ocr/",
  });
  try {
    const resultado: Partial<Record<keyof typeof FIELDS, string>> = {};
    for (const [nome, campo] of Object.entries(FIELDS) as [keyof typeof FIELDS, (typeof FIELDS)[keyof typeof FIELDS]][]) {
      const blob = await recortar(front, campo.box, { escala: 3, binarizar: campo.binarize, margem: 20 });
      if (!blob) continue;
      await worker.setParameters({ tessedit_char_whitelist: campo.whitelist, tessedit_pageseg_mode: "7" as Tesseract.PSM });
      const { data } = await worker.recognize(blob);
      resultado[nome] = data.text.trim();
    }
    return resultado;
  } finally {
    await worker.terminate();
  }
}
