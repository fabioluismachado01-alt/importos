import { NextResponse } from 'next/server'

export async function GET() {
  const db = process.env.DATABASE_URL ?? 'UNDEFINED'
  return NextResponse.json({
    DATABASE_URL_prefix: db.substring(0, 20),
    DATABASE_URL_length: db.length,
    NODE_ENV: process.env.NODE_ENV,
  })
}
