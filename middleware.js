import { NextResponse } from 'next/server';
import { verifySessionToken, AUTH_COOKIE_NAME } from '@/lib/auth';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // 1. Omitir archivos estáticos, assets e imágenes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js)$/)
  ) {
    return NextResponse.next();
  }

  // 2. Definir rutas públicas exentas de autenticación
  const isPublicAuthPage = pathname === '/login' || pathname === '/register';
  const isPublicApiAuth = pathname === '/api/auth/login' || pathname === '/api/auth/register';
  const isPublicWebhook = pathname.startsWith('/api/webhooks/');

  // Si es una API pública (login/register o webhooks), continuar inmediatamente
  if (isPublicApiAuth || isPublicWebhook) {
    return NextResponse.next();
  }

  // 3. Obtener token de sesión de la cookie o encabezado
  const token =
    request.cookies.get(AUTH_COOKIE_NAME)?.value ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  // 4. Atajo rápido: si NO hay token presente
  if (!token) {
    if (isPublicAuthPage) {
      return NextResponse.next();
    }
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Acceso no autorizado. Token de sesión ausente.' },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 5. Si SÍ hay token presente, verificar su vigencia en Supabase
  const session = await verifySessionToken(token);
  const isAuthenticated = !!session;

  // Manejo para páginas públicas de login/register cuando ya está autenticado
  if (isPublicAuthPage) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Proteger API routes si el token resultó inválido/expirado
  if (pathname.startsWith('/api/')) {
    if (!isAuthenticated) {
      return NextResponse.json(
        { success: false, error: 'Acceso no autorizado. Token de sesión no válido o expirado.' },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // Proteger páginas del dashboard si el token resultó inválido/expirado
  if (!isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
