import { put, list } from "@vercel/blob";
import { NextResponse } from "next/server";

const BLOB_PATH = "plan.json";

export async function GET() {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    if (!blobs.length) return NextResponse.json(null);
    const res = await fetch(blobs[0].url);
    if (!res.ok) return NextResponse.json(null);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null, { status: 503 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    await put(BLOB_PATH, JSON.stringify(body), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
