import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAuth } from "@/lib/auth";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Ajusta los tipos permitidos según la extensión del archivo.
        const isPdf = pathname.toLowerCase().endsWith(".pdf");
        return {
          addRandomSuffix: true,
          allowedContentTypes: isPdf
            ? ["application/pdf"]
            : ["application/json"],
          maximumSizeInBytes: 5 * 1024 * 1024, // 5 MB
          validUntil: Date.now() + 10 * 60 * 1000, // 10 minutos
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log("Archivo subido a Vercel Blob:", blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
