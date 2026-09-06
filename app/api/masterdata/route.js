import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  fetchAbandonedCarts,
  fetchMasterDataStats,
  fetchMasterDataClients,
  fetchMasterDataClientById,
  sendAbandonedCartEmail,
} from '@/lib/vtex';
import { verifySessionToken, AUTH_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'abandoned-carts';

    // 1. Estadísticas agregadas de Master Data CL
    if (action === 'stats') {
      const statsData = await fetchMasterDataStats();
      return NextResponse.json(statsData);
    }

    // 2. Detalle de cliente específico por ID de documento
    if (action === 'client-detail') {
      const id = searchParams.get('id');
      if (!id) {
        return NextResponse.json(
          { success: false, error: 'Parámetro id requerido.' },
          { status: 400 }
        );
      }
      const client = await fetchMasterDataClientById(id);
      if (!client) {
        return NextResponse.json(
          { success: false, error: 'Cliente no encontrado en Master Data CL.' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, client });
    }

    // 3. Consulta de clientes en Master Data CL
    if (action === 'clients') {
      const page = parseInt(searchParams.get('page') || '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
      const where = searchParams.get('where') || '';
      const sort = searchParams.get('sort') || 'updatedIn DESC';
      const result = await fetchMasterDataClients({ page, pageSize, where, sort });
      return NextResponse.json(result);
    }

    // 4. Carritos Abandonados (por defecto)
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '15', 10);
    const period = searchParams.get('period') || 'all';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const minValue = parseFloat(searchParams.get('minValue') || '0') || 0;
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'time_desc';
    const excludePurchased = searchParams.get('excludePurchased') !== 'false';
    const stage = searchParams.get('stage') || 'all';

    const cartsData = await fetchAbandonedCarts({
      page,
      pageSize,
      period,
      startDate,
      endDate,
      minValue,
      search,
      sortBy,
      excludePurchased,
      stage,
    });

    return NextResponse.json(cartsData);
  } catch (err) {
    console.error('Error en GET /api/masterdata:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    const user = token ? await verifySessionToken(token) : null;

    const body = await request.json();
    const action = body.action || 'send-abandoned-cart-email';

    if (action === 'send-abandoned-cart-email') {
      const { email, rclastcart, firstName, lastName, clientId, cartValue, currency, stage } = body;

      if (!email) {
        return NextResponse.json(
          { success: false, error: 'El correo electrónico del cliente es obligatorio.' },
          { status: 400 }
        );
      }

      const result = await sendAbandonedCartEmail({
        email,
        rclastcart,
        firstName,
        lastName,
        clientId,
        cartValue,
        currency,
        stage,
        sentBy: user?.name || user?.email || 'Operador',
        sentByEmail: user?.email || '',
      });

      return NextResponse.json(result);
    }

    return NextResponse.json(
      { success: false, error: `Acción '${action}' no reconocida.` },
      { status: 400 }
    );
  } catch (err) {
    console.error('Error en POST /api/masterdata:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno al procesar la solicitud.' },
      { status: 500 }
    );
  }
}
