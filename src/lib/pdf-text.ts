// Extração de texto de PDFs no navegador (pdf.js). Usado para analisar provas
// antigas sem enviar o arquivo inteiro para o servidor.

export async function extractPdfText(file: File, maxChars = 90_000) {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    text += `\n\n[página ${i}]\n${pageText}`;
    if (text.length > maxChars) break;
  }
  await (doc as unknown as { destroy: () => Promise<void> }).destroy();
  return text.slice(0, maxChars).trim();
}
