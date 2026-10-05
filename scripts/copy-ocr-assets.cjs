const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const out = path.join(root, "public", "ocr");

const coreVariants = ["lstm", "simd-lstm", "relaxedsimd-lstm"];
const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/@tesseract.js-data/por/4.0.0/por.traineddata.gz", "por.traineddata.gz"],
  ...coreVariants.flatMap((v) => [`tesseract-core-${v}.wasm`, `tesseract-core-${v}.wasm.js`])
    .map((f) => [`node_modules/tesseract.js-core/${f}`, f]),
];

fs.mkdirSync(out, { recursive: true });
for (const [src, dest] of files) {
  const from = path.join(root, src);
  if (!fs.existsSync(from)) {
    console.warn(`[ocr] ficheiro não encontrado: ${src}`);
    continue;
  }
  fs.copyFileSync(from, path.join(out, dest));
}
