import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

function formatDateTime(isoStr) {
  if (!isoStr) return 'N/A';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('es-NI', { timeZone: 'America/Managua' });
  } catch {
    return isoStr;
  }
}

async function generateReport() {
  console.log('Consultando notificaciones de carritos abandonados en Supabase...');
  const { data: notifications, error: notifErr } = await supabase
    .from('vtex_abandoned_cart_notifications')
    .select('*')
    .order('sent_at', { ascending: false });

  if (notifErr) {
    console.error('Error al consultar notificaciones:', notifErr);
    process.exit(1);
  }

  console.log(`Se obtuvieron ${notifications.length} registros de notificaciones.`);

  console.log('Consultando órdenes en VTEX OMS (public.vtex_orders)...');
  const { data: orders, error: ordersErr } = await supabase
    .from('vtex_orders')
    .select('order_id, client_email, client_name, creation_date, total_value, status, detail_json');

  if (ordersErr) {
    console.error('Error al consultar órdenes:', ordersErr);
    process.exit(1);
  }

  console.log(`Se obtuvieron ${orders.length} órdenes para cruce de atribución.`);

  // Procesar cruce de conversión
  const processed = notifications.map((n) => {
    const notifTime = new Date(n.sent_at).getTime();
    const cleanEmail = (n.client_email || '').toLowerCase().trim();

    // Buscar órdenes del mismo cliente creadas POSTERIOR al envío del correo
    const matchingOrders = (orders || []).filter((o) => {
      if (o.status === 'canceled') return false;
      const oEmail = (o.client_email || '').toLowerCase().trim();
      if (oEmail !== cleanEmail) return false;
      const oTime = new Date(o.creation_date).getTime();
      return oTime >= notifTime;
    });

    let convertedOrder = null;
    let hoursToPurchase = null;

    if (matchingOrders.length > 0) {
      // Orden más cercana
      matchingOrders.sort((a, b) => new Date(a.creation_date) - new Date(b.creation_date));
      convertedOrder = matchingOrders[0];
      hoursToPurchase = ((new Date(convertedOrder.creation_date).getTime() - notifTime) / (1000 * 3600)).toFixed(1);
    }

    return {
      id: n.id,
      client_email: n.client_email,
      client_name: [n.first_name, n.last_name].filter(Boolean).join(' ') || 'Cliente',
      cart_value: parseFloat(n.cart_value) || 0,
      stage: n.stage || 'cart',
      sent_at: n.sent_at,
      sent_at_nicaragua: formatDateTime(n.sent_at),
      sent_by: n.sent_by || 'Operador',
      sent_by_email: n.sent_by_email || '',
      vtex_status: n.vtex_status || 200,
      rclastcart: n.rclastcart || '',
      isConverted: !!convertedOrder,
      convertedOrderId: convertedOrder?.order_id || null,
      convertedOrderDate: convertedOrder ? formatDateTime(convertedOrder.creation_date) : null,
      convertedOrderValue: convertedOrder ? (parseFloat(convertedOrder.total_value) || 0) : null,
      convertedOrderStatus: convertedOrder?.status || null,
      hoursToPurchase,
    };
  });

  const oct2026 = processed.filter((r) => r.sent_at?.startsWith('2026-10'));
  const sep2026 = processed.filter((r) => r.sent_at?.startsWith('2026-09'));

  // Métricas generales
  const totalSent = processed.length;
  const totalOct = oct2026.length;
  const totalSep = sep2026.length;
  const uniqueEmails = new Set(processed.map((r) => r.client_email.toLowerCase())).size;

  const totalConverted = processed.filter((r) => r.isConverted);
  const octConverted = oct2026.filter((r) => r.isConverted);
  const sepConverted = sep2026.filter((r) => r.isConverted);

  const totalRecoveredMoney = totalConverted.reduce((sum, r) => sum + (r.convertedOrderValue || 0), 0);
  const octRecoveredMoney = octConverted.reduce((sum, r) => sum + (r.convertedOrderValue || 0), 0);
  const sepRecoveredMoney = sepConverted.reduce((sum, r) => sum + (r.convertedOrderValue || 0), 0);

  // 1. Hoja Resumen
  const summarySheetData = [
    ['INFORME DE GESTIÓN Y RECUPERACIÓN DE CARRITOS ABANDONADOS — SINSA'],
    ['Generado el:', new Date().toLocaleString('es-NI', { timeZone: 'America/Managua' })],
    ['Fuente:', 'Supabase public.vtex_abandoned_cart_notifications & VTEX OMS'],
    [],
    ['MÉTRICA / INDICADOR', 'VALOR'],
    ['Total Histórico de Correos Enviados', totalSent],
    ['Correos Enviados en Octubre 2026 (Mes Actual)', totalOct],
    ['Correos Enviados en Septiembre 2026', totalSep],
    ['Clientes Únicos Notificados', uniqueEmails],
    ['Total Carritos Recuperados (Compras Concretadas)', totalConverted.length],
    ['Tasa de Conversión Histórica', `${((totalConverted.length / totalSent) * 100).toFixed(2)}%`],
    ['Monto Total Facturado Recuperado (C$ NIO)', Math.round(totalRecoveredMoney * 100) / 100],
    [],
    ['DETALLE POR MES', 'ENVIADOS', 'RECUPERADOS', 'TASA CONVERSIÓN', 'FACTURADO RECUPERADO (C$)'],
    ['Octubre 2026', totalOct, octConverted.length, `${((octConverted.length / (totalOct || 1)) * 100).toFixed(1)}%`, Math.round(octRecoveredMoney * 100) / 100],
    ['Septiembre 2026', totalSep, sepConverted.length, `${((sepConverted.length / (totalSep || 1)) * 100).toFixed(1)}%`, Math.round(sepRecoveredMoney * 100) / 100],
    [],
    ['METODOLOGÍA DE ATRIBUCIÓN'],
    ['1. Cruce Determinístico:', 'Se audita el correo del cliente impactado con las órdenes registradas en VTEX OMS.'],
    ['2. Ventana Temporal:', 'Se comprueba que la orden haya sido creada con posterioridad a la fecha y hora del correo.'],
    ['3. Validación de Estado:', 'Se excluyen órdenes canceladas en VTEX para garantizar que el ingreso sea real.'],
  ];

  // 2. Mapeo para hojas detalladas
  const mapRowsForExcel = (items) =>
    items.map((item, idx) => ({
      '#': idx + 1,
      'Fecha y Hora (Nicaragua)': item.sent_at_nicaragua,
      'Correo del Cliente': item.client_email,
      'Nombre del Cliente': item.client_name,
      'Valor Carrito Abandonado (C$)': item.cart_value,
      'Etapa Abandono': item.stage === 'shipping' ? 'Envío' : item.stage === 'payment' ? 'Pasarela' : item.stage === 'profile' ? 'Perfil' : 'Carrito',
      'Operador Responsable': item.sent_by,
      'Correo Operador': item.sent_by_email,
      'Estado Envío VTEX': item.vtex_status === 200 ? '200 OK (Enviado)' : `${item.vtex_status} (Procesado VTEX)`,
      '¿Compró Posteriormente?': item.isConverted ? 'SÍ' : 'NO',
      'Orden VTEX Recuperada': item.convertedOrderId || 'N/A',
      'Fecha Compra VTEX': item.convertedOrderDate || 'N/A',
      'Horas Transcurridas': item.hoursToPurchase ? `${item.hoursToPurchase} hrs` : 'N/A',
      'Monto Facturado Orden (C$)': item.convertedOrderValue ? item.convertedOrderValue : 0,
      'Estado de la Orden': item.convertedOrderStatus || 'N/A',
      'Enlace Recuperación VTEX': item.rclastcart || 'N/A',
    }));

  const octRows = mapRowsForExcel(oct2026);
  const sepRows = mapRowsForExcel(sep2026);
  const allRows = mapRowsForExcel(processed);
  const convertedRows = mapRowsForExcel(totalConverted);

  // Crear Workbook
  const wb = XLSX.utils.book_new();

  const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
  const wsOct = XLSX.utils.json_to_sheet(octRows);
  const wsSep = XLSX.utils.json_to_sheet(sepRows);
  const wsConverted = XLSX.utils.json_to_sheet(convertedRows);
  const wsAll = XLSX.utils.json_to_sheet(allRows);

  // Ajustar anchos de columnas
  const setColWidths = (ws) => {
    ws['!cols'] = [
      { wch: 6 },
      { wch: 22 },
      { wch: 32 },
      { wch: 26 },
      { wch: 18 },
      { wch: 14 },
      { wch: 18 },
      { wch: 26 },
      { wch: 22 },
      { wch: 14 },
      { wch: 22 },
      { wch: 22 },
      { wch: 16 },
      { wch: 20 },
      { wch: 18 },
      { wch: 40 },
    ];
  };

  setColWidths(wsOct);
  setColWidths(wsSep);
  setColWidths(wsConverted);
  setColWidths(wsAll);

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Ejecutivo');
  XLSX.utils.book_append_sheet(wb, wsOct, 'Envíos Octubre 2026');
  XLSX.utils.book_append_sheet(wb, wsSep, 'Envíos Septiembre 2026');
  XLSX.utils.book_append_sheet(wb, wsConverted, 'Carritos Recuperados (Compras)');
  XLSX.utils.book_append_sheet(wb, wsAll, 'Todos los Envíos (Histórico)');

  const publicPath = path.resolve('public', 'reporte_envios_correos_carritos_sinsa.xlsx');
  const rootPath = path.resolve('reporte_envios_correos_carritos_sinsa.xlsx');

  XLSX.writeFile(wb, publicPath);
  XLSX.writeFile(wb, rootPath);

  console.log(`\n¡Reporte Excel generado con éxito!`);
  console.log(`- Archivo descargable: ${publicPath}`);
  console.log(`- Archivo en raíz: ${rootPath}`);
}

generateReport().catch(console.error);
