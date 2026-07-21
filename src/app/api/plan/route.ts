import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const KV_KEY = "plan:v1";

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

export async function GET() {
  try {
    const redis = getRedis();
    const data = await redis.get(KV_KEY);
    return NextResponse.json(data ?? null);
  } catch {
    return NextResponse.json(null, { status: 503 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const redis = getRedis();
    await redis.set(KV_KEY, body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
