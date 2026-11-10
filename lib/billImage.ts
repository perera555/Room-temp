"use client";

import { sendOrQueue } from "./outbox";

/** Shrink a photo to max 1600 px, JPEG 80%, so it fits the free database (~200–400 KB). PDFs are kept as they are. */
export async function compressBill(file: File): Promise<string> {
  const read = (f: Blob) =>
    new Promise<string>((ok, bad) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = () => bad(r.error);
      r.readAsDataURL(f);
    });
  if (file.type === "application/pdf") return read(file);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Upload a bill photo; returns its id (or null if it was queued offline / could not be saved). */
export async function uploadBill(file: File): Promise<string | null> {
  const dataUrl = await compressBill(file);
  const res = await sendOrQueue("/api/bill-image", "POST", { dataUrl });
  return typeof res.id === "string" ? res.id : null;
}

export const billImageUrl = (id: string) => `/api/bill-image?id=${encodeURIComponent(id)}`;
