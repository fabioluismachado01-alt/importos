import { type NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SESSION_OPTIONS } from '@/lib/auth'
import type { SessionData } from '@/types/auth'

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/ml-proxy', '/api/ml/callback']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rotas públicas sempre passam
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Assets e internos do Next
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Verifica sessão
  const response = NextResponse.next()
  // iron-session aceita a interface de cookies do Next.js middleware
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getIronSession<SessionData>(request.cookies as any, SESSION_OPTIONS)

  if (!session.userId) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redireciona raiz para dashboard
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
