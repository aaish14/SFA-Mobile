import bwipjs from "bwip-js";

export type RecordBarcode = {
  format: "CODE128";
  value: string;
  image: string;
  width: number;
  height: number;
};
const images = new Map<string, Promise<RecordBarcode>>();

/** Encode only a stable record reference, never prices, personal data or an access token. */
export function barcodeValue(kind: "invoice" | "product" | "return", id: unknown): string | null {
  if (typeof id !== "string" || !/^[A-Za-z0-9]{18}$/.test(id)) return null;
  return `${kind === "invoice" ? "I" : kind === "return" ? "R" : "P"}-${id}`;
}

/** Render Code 128 locally, with quiet zones; reuse a bounded cache of identifier-only images. */
export async function recordBarcode(kind: "invoice" | "product" | "return", id: unknown): Promise<RecordBarcode | null> {
  const value = barcodeValue(kind, id);
  if (!value) return null;
  let image = images.get(value);
  if (!image) {
    if (images.size >= 512) images.delete(images.keys().next().value!);
    image = bwipjs.toBuffer({
      bcid: "code128", text: value, scale: 2, height: 12,
      paddingwidth: 12, paddingheight: 4, backgroundcolor: "FFFFFF",
      includetext: true, textxalign: "center", textsize: 10,
    }).then(png => ({
      format: "CODE128" as const, value, image: `data:image/png;base64,${png.toString("base64")}`,
      width: png.readUInt32BE(16), height: png.readUInt32BE(20),
    })).catch(error => { images.delete(value); throw error; });
    images.set(value, image);
  }
  return image;
}

/** Resolve the invoice reference from a scanner; possession of the code grants no access. */
export function invoiceIdFromBarcode(value: unknown): string | null {
  return typeof value === "string" ? /^I-([A-Za-z0-9]{18})$/.exec(value.trim())?.[1] || null : null;
}

/** Add identifiers and barcode images to an already authorized invoice; do not change financial snapshots. */
export async function decorateInvoice(invoice: Record<string, any>): Promise<Record<string, any> & { barcode: RecordBarcode | null }> {
  return {
    ...invoice,
    barcode: await recordBarcode("invoice", invoice.Id),
    ...(invoice.lines ? { lines: await Promise.all(invoice.lines.map(async (line: any) => ({
      ...line, barcode: await recordBarcode("product", line.Product__c),
    }))) } : {}),
  };
}
