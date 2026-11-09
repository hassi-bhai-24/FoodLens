// Image pipeline: strip EXIF/GPS by redrawing on canvas, resize to
// ~1600px on the long edge, compress to JPEG/WebP. HEIC files are
// rejected with a clear message (lazy-loaded decoder not bundled;
// see PROGRESS.md) rather than silently failing. The same canvas draw
// also feeds a deterministic blur/dark/flat quality estimate (preview
// v7, the Test 18 gap) so the composer can warn before a blurry label
// is sent — see lib/photo-check.ts.
import type { ChatImage } from "./types";
import { assessImageQuality } from "./photo-check";

export const MAX_IMAGES_PER_MESSAGE = 6;
// Refuse very large files before decoding them: a >10 MB or
// huge-dimension image can exhaust memory in createImageBitmap.
export const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 16000;

export async function processImageFile(file: File): Promise<ChatImage> {
  if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
    throw new Error("HEIC photos are not supported in this build yet. Please convert the photo to JPEG or PNG and try again.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error(`Unsupported file type: ${file.type || file.name}. Please send an image file.`);
  }
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    throw new Error("This photo is too large (over 10 MB). Please use a smaller photo or take it at a lower resolution and try again.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image file looks damaged or is not a supported image. Please try a different photo.");
  }
  if (bitmap.width > MAX_IMAGE_DIMENSION || bitmap.height > MAX_IMAGE_DIMENSION) {
    bitmap.close();
    throw new Error("This photo's dimensions are too large. Please use a smaller photo and try again.");
  }
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process this image in your browser.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  // Best-effort quality estimate on the drawn pixels: warns the user in
  // the composer when a photo looks too blurry/dark to read as a label.
  // Never blocks sending — a food photo needs no readable text.
  let quality: ChatImage["quality"];
  try {
    quality = assessImageQuality(ctx.getImageData(0, 0, width, height).data, width, height);
  } catch {
    quality = undefined; // no quality data — send without the warning, as before
  }
  // Redrawing on canvas drops EXIF/GPS metadata.
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("Could not compress this image.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mime: "image/jpeg",
    dataUrl,
    width,
    height,
    quality,
  };
}

export function dataUrlSizeBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}
