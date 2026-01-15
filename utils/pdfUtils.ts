import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source to the esm.sh version matching the library.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const convertPdfToImages = async (
  file: File
): Promise<{ base64: string; textContent: string; pageNumber: number }[]> => {
  const arrayBuffer = await file.arrayBuffer();
  
  // Load the PDF document
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDocument = await loadingTask.promise;
  const numPages = pdfDocument.numPages;
  const images: { base64: string; textContent: string; pageNumber: number }[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    
    // 1. Attempt to extract text layer content (if available)
    // This helps significantly with character accuracy for non-scanned PDFs
    let pageText = "";
    try {
      const textContent = await page.getTextContent();
      // Filter out items that don't have 'str' (TextMarkedContent) and join
      pageText = textContent.items
        .map((item: any) => item.str || "")
        .join(" ");
    } catch (e) {
      console.warn(`Page ${pageNum}: Could not extract text content`, e);
    }

    // 2. Render to Image
    // Increase scale from 2.0 to 3.0 for better OCR accuracy on Chinese characters
    const viewport = page.getViewport({ scale: 3.0 });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) continue;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    // Convert to JPEG base64 (remove prefix for API)
    const base64Url = canvas.toDataURL('image/jpeg', 0.8);
    const base64Data = base64Url.split(',')[1];

    images.push({
      base64: base64Data,
      textContent: pageText,
      pageNumber: pageNum,
    });
  }

  return images;
};