import { put } from "@vercel/blob";

export async function uploadCatalogFile(
  fileName: string,
  buffer: Buffer
): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return null;
  }

  const blob = await put(`catalog/${Date.now()}-${fileName}`, buffer, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return blob.url;
}
