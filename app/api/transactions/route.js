import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import {
  isVtexConfigured,
  fetchVtexTransactionsBatch,
  fetchVtexTransactionDetail,
  fetchVtexTransactionInteractions,
  fetchVtexTransactionPayments,
  fetchVtexOrders,
  fetchVtexOrderDetail,
  fetchSkuImageUrl,
} from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Diccionario Completo de Códigos de Error Bancarios, ISO-8583 y Pasarela Tilopay
const ERROR_DICTIONARY = {
  // Aprobadas
  '00': { code: '00', title: 'Transacción Aprobada Exitosamente', description: 'El pago fue procesado y autorizado correctamente por la pasarela de pago (Tilopay) y el banco emisor.' },
  '0': { code: '00', title: 'Transacción Aprobada Exitosamente', description: 'El pago fue procesado y autorizado correctamente por la pasarela de pago (Tilopay) y el banco emisor.' },

  // Referencias y Banco Emisor (01 - 07 / 1 - 7)
  '01': { code: '01', title: 'Consulte al Banco Emisor (Code 01 - Refer to Issuer)', description: 'El banco emisor de la tarjeta requiere validación directa o autorización telefónica del tarjetahabiente.' },
  '1': { code: '01', title: 'Consulte al Banco Emisor (Code 01 - Refer to Issuer)', description: 'El banco emisor de la tarjeta requiere validación directa o autorización telefónica del tarjetahabiente.' },
  '02': { code: '02', title: 'Consulte al Banco Emisor - Condición Especial (Code 02)', description: 'El banco emisor requiere verificación manual de la cuenta antes de autorizar.' },
  '2': { code: '02', title: 'Consulte al Banco Emisor - Condición Especial (Code 02)', description: 'El banco emisor requiere verificación manual de la cuenta antes de autorizar.' },
  '03': { code: '03', title: 'Número de Comercio Inválido (Code 03 - Invalid Merchant)', description: 'Los detalles referentes al número de comercio son erróneos o la configuración de su instalación comercial presenta problemas.' },
  '3': { code: '03', title: 'Número de Comercio Inválido (Code 03 - Invalid Merchant)', description: 'Los detalles referentes al número de comercio son erróneos o la configuración de su instalación comercial presenta problemas.' },
  '04': { code: '04', title: 'Retener Tarjeta (Code 04 - Capture Card)', description: 'El banco emisor ordenó retener la tarjeta por posible bloqueo administrativo.' },
  '4': { code: '04', title: 'Retener Tarjeta (Code 04 - Capture Card)', description: 'El banco emisor ordenó retener la tarjeta por posible bloqueo administrativo.' },
  '05': { code: '05', title: 'Transacción No Honrada (Code 05 - Do Not Honor)', description: 'El banco emisor declinó la transacción por políticas internas de prevención de riesgo de la tarjeta.' },
  '5': { code: '05', title: 'Transacción No Honrada (Code 05 - Do Not Honor)', description: 'El banco emisor declinó la transacción por políticas internas de prevención de riesgo de la tarjeta.' },
  '06': { code: '06', title: 'Error General de Transacción (Code 06)', description: 'Ocurrió un error no especificado en el emisor. Se sugiere no reintentar inmediatamente.' },
  '6': { code: '06', title: 'Error General de Transacción (Code 06)', description: 'Ocurrió un error no especificado en el emisor. Se sugiere no reintentar inmediatamente.' },
  '07': { code: '07', title: 'Retener Tarjeta - Condición Especial (Code 07)', description: 'El banco emisor requiere la retención de la tarjeta por investigación de seguridad.' },
  '7': { code: '07', title: 'Retener Tarjeta - Condición Especial (Code 07)', description: 'El banco emisor requiere la retención de la tarjeta por investigación de seguridad.' },

  // Parámetros y Tarjeta (12 - 30)
  '12': { code: '12', title: 'Transacción Inválida (Code 12 - Invalid Transaction)', description: 'La solicitud de pago contiene parámetros, montos o formatos no aceptados por la red bancaria.' },
  '13': { code: '13', title: 'Monto Inválido (Code 13 - Invalid Amount)', description: 'El monto ingresado es menor a 0 o excede los límites decimales permitidos por la pasarela.' },
  '14': { code: '14', title: 'Número de Tarjeta Inválido (Code 14 - Invalid Card Number)', description: 'El número de tarjeta digitado es incorrecto, no existe o falló la verificación de dígito chequeo (Luhn).' },
  '15': { code: '15', title: 'Banco Emisor Desconocido (Code 15 - No Such Issuer)', description: 'El código BIN de la tarjeta no corresponde a ningún banco o emisor registrado.' },
  '19': { code: '19', title: 'Reintente Transacción (Code 19 - Re-enter Transaction)', description: 'Error temporal en el envío de la solicitud. Intente procesar la transacción nuevamente.' },
  '25': { code: '25', title: 'Rechazada por Banco Emisor (Code 25 - Issuer Decline)', description: 'El banco emisor de la tarjeta rechazó la transacción. Ocurre por restricciones de seguridad o tarjeta no habilitada para e-commerce. Sugerir al cliente contactar a su banco.' },
  '28': { code: '28', title: 'Servicio Inaccesible (Code 28)', description: 'El archivo de cuentas del banco emisor está temporalmente fuera de línea.' },
  '30': { code: '30', title: 'Error de Formato en Mensaje (Code 30 - Format Error)', description: 'Error en la estructura del mensaje enviado por la pasarela hacia el procesador del banco.' },

  // Tarjetas Robadas / Perdidas (41 - 43)
  '41': { code: '41', title: 'Tarjeta Reportada Perdida (Code 41 - Lost Card)', description: 'La tarjeta fue reportada como extraviada por el titular ante el banco emisor.' },
  '42': { code: '42', title: 'Sin Cuenta Asociada (Code 42 - No Universal Account)', description: 'El número de tarjeta no posee una cuenta bancaria o de crédito activa asociada.' },
  '43': { code: '43', title: 'Tarjeta Reportada Robada (Code 43 - Stolen Card)', description: 'La tarjeta fue reportada como robada por el titular ante el banco emisor.' },

  // Saldos, Restricciones y Vencimiento (51 - 65)
  '51': { code: '51', title: 'Fondos Insuficientes (Code 51 - Insufficient Funds)', description: 'La tarjeta de crédito/débito no posee saldo disponible o la línea de crédito fue superada.' },
  '54': { code: '54', title: 'Tarjeta Vencida (Code 54 - Expired Card)', description: 'La fecha de expiración ingresada (mes/año) ha caducado.' },
  '55': { code: '55', title: 'Clave / PIN Incorrecto (Code 55 - Incorrect PIN)', description: 'El código PIN o clave introducido por el cliente fue incorrecto.' },
  '57': { code: '57', title: 'Transacción No Permitida a la Tarjeta (Code 57 - Transaction Not Permitted)', description: 'La tarjeta no está autorizada para compras e-commerce o transacciones en línea.' },
  '58': { code: '58', title: 'Transacción No Permitida en Terminal (Code 58)', description: 'El comercio no tiene habilitado el tipo de procesamiento para esta tarjeta.' },
  '61': { code: '61', title: 'Límite de Monto Superado (Code 61 - Exceeds Amount Limit)', description: 'El monto total excede el límite máximo de transacción individual permitido por el banco.' },
  '62': { code: '62', title: 'Tarjeta Restringida / Bloqueo Preventivo (Code 62 - Restricted Card)', description: 'La tarjeta tiene bloqueos temporales por prevención de fraude del banco emisor.' },
  '63': { code: '63', title: 'Violación de Seguridad (Code 63 - Security Violation)', description: 'Falló la validación de los protocolos de seguridad 3D Secure / OTP del banco emisor.' },
  '65': { code: '65', title: 'Límite de Intentos Superado (Code 65 - Activity Limit Exceeded)', description: 'Se superó el número máximo de compras o intentos permitidos por día en la tarjeta.' },

  // CVV y Cuentas (75 - 85 & Redes Bancarias N7)
  '75': { code: '75', title: 'Intentos de Código CVV/PIN Excedidos (Code 75)', description: 'Se excedió el número de intentos fallidos al ingresar el código de seguridad o PIN de la tarjeta.' },
  '78': { code: '78', title: 'Cuenta Inexistente o Inactiva (Code 78 - No Account)', description: 'La cuenta bancaria asociada a la tarjeta se encuentra cancelada o inactiva.' },
  '82': { code: '82', title: 'Código CVV/CVC Incorrecto (Code 82 - Invalid / Negative CVV)', description: 'El código de seguridad (CVV/CVC físico, iCVV de chip o dCVV dinámico) no coincide con los registros del banco. Las pasarelas de pago suelen estandarizar respuestas de red (como N7) a este código 82.' },
  '85': { code: '85', title: 'Rechazo General por Validación de Cuenta (Code 85)', description: 'El banco emisor declinó la verificación de los datos de la cuenta.' },
  'N7': { code: 'N7', title: 'Falla en CVV2 (Code N7 - Decline for CVV2 Failure)', description: 'Código de respuesta de bajo nivel originado en redes de procesamiento (VisaNet/ISO 8583) por falla específica en la verificación del CVV2 impreso en el reverso o frente de la tarjeta.' },

  // Errores de Red y Sistema (91 - 96)
  '91': { code: '91', title: 'Banco Emisor Fuera de Línea (Code 91 - Timeout)', description: 'El banco emisor no respondió la solicitud de autorización a tiempo (Tiempo de espera agotado).' },
  '93': { code: '93', title: 'Transacción No Autorizada por Ley (Code 93)', description: 'Restricción legal o bancaria impuesta sobre la cuenta del titular.' },
  '96': { code: '96', title: 'Error de Sistema del Banco Emisor (Code 96 - System Malfunction)', description: 'Falla técnica o de comunicación temporal en la plataforma del banco emisor.' },
};

function translateError(rawCode, rawMsg, interactions = []) {
  let cleanCode = rawCode ? String(rawCode).trim() : null;

  if (!cleanCode && interactions.length > 0) {
    const rawLogs = interactions.map((i) => i.Message || '').join(' ');
    const codeMatch = rawLogs.match(/"code":"([A-Za-z0-9]+)"/i) || rawLogs.match(/"returnCode":"([A-Za-z0-9]+)"/i);
    if (codeMatch) cleanCode = codeMatch[1];
  }

  // Normalizar código de 1 dígito a 2 dígitos (ej: '3' -> '03', '5' -> '05')
  const paddedCode = cleanCode && cleanCode.length === 1 ? `0${cleanCode}` : cleanCode;
  const upperCode = cleanCode ? cleanCode.toUpperCase() : null;
  const upperPadded = paddedCode ? paddedCode.toUpperCase() : null;
  const fullText = (rawMsg || '') + ' ' + interactions.map((i) => i.Message || '').join(' ');

  // 1. Coincidencia Directa en el Diccionario Oficial de Errores Tilopay / Bancarios / Redes (ISO 8583 / VisaNet)
  if (cleanCode && ERROR_DICTIONARY[cleanCode]) {
    return ERROR_DICTIONARY[cleanCode];
  }
  if (upperCode && ERROR_DICTIONARY[upperCode]) {
    return ERROR_DICTIONARY[upperCode];
  }
  if (paddedCode && ERROR_DICTIONARY[paddedCode]) {
    return ERROR_DICTIONARY[paddedCode];
  }
  if (upperPadded && ERROR_DICTIONARY[upperPadded]) {
    return ERROR_DICTIONARY[upperPadded];
  }

  // 2. Errores Técnicos de Configuración de VTEX / Pasarela (ej: Afiliación o Cuenta Inexistente)
  if (
    fullText.includes('requested account information does not exist') ||
    fullText.includes('requested account information does not exists') ||
    fullText.includes('CreditCardPayment.<LoadFieldsAsync>')
  ) {
    return {
      code: 'GATEWAY_CONFIG',
      title: 'Error de Configuración de Pasarela (Account Not Found)',
      description: 'La cuenta de afiliación o conector de pagos asignado en VTEX Checkout no existe o fue deshabilitada en la plataforma.',
    };
  }

  if (fullText.includes('The payment provider returned an invalid response') || fullText.includes('InvalidResponseException')) {
    return {
      code: 'INVALID_RESPONSE',
      title: 'Respuesta Inválida de Pasarela',
      description: 'La pasarela de pago devolvió una respuesta malformada o no compatible con la pasarela de VTEX.',
    };
  }

  if (fullText.includes('TaskCanceledException') || fullText.includes('HttpRequestException') || fullText.includes('Timeout')) {
    return {
      code: 'GATEWAY_TIMEOUT',
      title: 'Tiempo de Espera Agotado en Pasarela (Timeout)',
      description: 'La conexión entre VTEX y la pasarela de pago expiró sin recibir respuesta.',
    };
  }

  // 3. Si no hay código bancario/pasarela explícito pero el log indica pago no completado por el cliente
  if (fullText.includes('user needs to finish payment')) {
    return {
      code: 'PENDING_CHECKOUT',
      title: 'Pago No Completado en Checkout',
      description: 'El cliente no completó el formulario de pago o cerró la ventana emergente de Tilopay antes de autorizar la transacción.',
    };
  }

  // 4. Fallbacks
  if (fullText.includes('Finished retries') || fullText.includes('Could not authorize')) {
    return {
      code: cleanCode || 'AUTH_DENIED',
      title: cleanCode ? `Transacción Rechazada (Code ${cleanCode})` : 'Autorización Denegada por la Pasarela',
      description: cleanCode
        ? `El banco emisor o la pasarela denegó el cobro con el código de retorno ${cleanCode}.`
        : 'La pasarela de pago (Tilopay) agotó los reintentos de autorización sin obtener aprobación del banco emisor.',
    };
  }

  if (fullText.includes('Transaction cancelation has finished')) {
    return {
      code: 'USER_CANCELED',
      title: 'Transacción Cancelada en Checkout',
      description: 'La transacción fue cancelada por expiración de sesión o por acción del usuario antes del pago.',
    };
  }

  return {
    code: cleanCode || 'REJECTED',
    title: cleanCode ? `Transacción Rechazada (Code ${cleanCode})` : 'Transacción Rechazada',
    description: 'La transacción fue rechazada o cancelada en el checkout antes de completarse el cobro.',
  };
}

/**
 * Convierte cualquier fecha UTC de VTEX a fecha de calendario Nicaragua YYYY-MM-DD (America/Managua, UTC-6)
 */
function getNicDateString(dateInput) {
  if (!dateInput) return null;
  const str = String(dateInput).endsWith('Z') || String(dateInput).includes('+') ? String(dateInput) : `${dateInput}Z`;
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export async function GET(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX no está configurado en las variables de entorno.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const transactionIdParam = searchParams.get('transactionId') || searchParams.get('txId');
    const orderIdParam = searchParams.get('orderId');

    // --------------------------------------------------------------------------
    // 1. CONSULTA DE DETALLE COMPLETO DE UNA TRANSACCIÓN ESPECÍFICA
    // --------------------------------------------------------------------------
    if (transactionIdParam || orderIdParam) {
      let txDetail = null;
      let interactions = [];
      let payments = [];
      let orderDetail = null;
      let targetTxId = transactionIdParam;

      if (orderIdParam) {
        orderDetail = await fetchVtexOrderDetail(orderIdParam.trim());
        if (orderDetail?.paymentData?.transactions?.[0]?.transactionId) {
          targetTxId = orderDetail.paymentData.transactions[0].transactionId;
        }
      }

      if (targetTxId) {
        const [txRes, interRes, payRes] = await Promise.all([
          fetchVtexTransactionDetail(targetTxId),
          fetchVtexTransactionInteractions(targetTxId),
          fetchVtexTransactionPayments(targetTxId),
        ]);
        txDetail = txRes;
        interactions = interRes;
        payments = payRes;

        if (!orderDetail) {
          const associatedOrderId =
            txDetail?.orderId ||
            txDetail?.fields?.find((f) => f.name === 'orderId')?.value ||
            txDetail?.referenceKey;
          if (associatedOrderId) {
            orderDetail = await fetchVtexOrderDetail(associatedOrderId);
          }
        }
      }

      if (!txDetail && !orderDetail) {
        return NextResponse.json(
          { success: false, error: 'Transacción u orden no encontrada.' },
          { status: 404 }
        );
      }

      const enriched = await buildEnrichedTransaction(txDetail, orderDetail, interactions, payments);

      // Persistir de inmediato en Supabase la transacción consultada individualmente
      if (isSupabaseConfigured()) {
        try {
          const singlePayload = {
            transaction_id: String(enriched.transactionId || enriched.key || enriched.orderId),
            order_id: enriched.orderId || null,
            status: enriched.status || 'Pending',
            start_date: enriched.startDate || new Date().toISOString(),
            client_name: enriched.client?.name || null,
            client_email: enriched.client?.email || null,
            client_phone: enriched.client?.phone || null,
            client_document: enriched.client?.document || null,
            payment_system: enriched.payment?.systemName || null,
            card_number: enriched.payment?.cardNumber || null,
            card_holder: enriched.payment?.cardHolder || null,
            amount: enriched.amount || 0,
            acquirer: enriched.payment?.acquirer || null,
            tid: enriched.payment?.tid || null,
            auth_id: enriched.payment?.authId || null,
            return_code: enriched.payment?.returnCode || null,
            return_message: enriched.payment?.returnMessage || null,
            error_code: enriched.errorDiagnostics?.code || null,
            error_title: enriched.errorDiagnostics?.title || null,
            error_description: enriched.errorDiagnostics?.description || null,
            is_error: enriched.errorDiagnostics?.isError || false,
            is_refund: enriched.errorDiagnostics?.isRefund || false,
            cancel_reason: enriched.errorDiagnostics?.cancelReason || null,
            items: enriched.skus || [],
            raw_payload: enriched,
            updated_at: new Date().toISOString(),
          };

          await supabaseAdmin
            .from('vtex_transactions')
            .upsert([singlePayload], { onConflict: 'transaction_id' });

          // Nota: El envío del evento refund a GA4 ahora es procesado automáticamente por el Webhook de Órdenes VTEX OMS (/api/webhooks/vtex-orders) cuando una orden es cancelada.
        } catch (dbErr) {
          console.warn('Aviso guardando detalle individual en Supabase:', dbErr.message);
        }
      }

      return NextResponse.json({ success: true, transaction: enriched });
    }

    // --------------------------------------------------------------------------
    // 2. CONSULTA DE LISTADO COMPLETO Y BÚSQUEDA INTEGRADA OMS + PAYMENTS
    // --------------------------------------------------------------------------
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const statusFilter = (searchParams.get('status') || '').toLowerCase();
    const searchFilter = (searchParams.get('search') || '').trim();

    // Convertir fechas a formato ISO para consultar OMS
    const startIso = startDateParam ? new Date(`${startDateParam}T00:00:00-06:00`).toISOString() : null;
    const endIso = endDateParam ? new Date(`${endDateParam}T23:59:59-06:00`).toISOString() : null;

    // Consultar tanto VTEX Payments API (últimos intentos de pago) como VTEX OMS API (filtrado por rango de fechas o búsqueda)
    const [txBatch, omsOrdersRes] = await Promise.all([
      fetchVtexTransactionsBatch(4).catch(() => ({ items: [] })),
      fetchVtexOrders(startIso, endIso, '', searchFilter, 1, 50).catch(() => ({ list: [] })),
    ]);

    const rawTxList = txBatch.items || [];
    const omsMatchList = omsOrdersRes.list || [];

    const rawItemsToProcess = [];
    const seenKeys = new Set();

    // 1. Registrar e incluir transacciones provenientes de VTEX Payments API
    for (const tx of rawTxList) {
      if (tx.id) seenKeys.add(String(tx.id));
      if (tx.transactionId) seenKeys.add(String(tx.transactionId));
      if (tx.referenceKey) seenKeys.add(String(tx.referenceKey));
      if (tx.orderId) seenKeys.add(String(tx.orderId).replace(/-\d+$/, ''));

      rawItemsToProcess.push(tx);
    }

    // 2. Incluir órdenes de VTEX OMS API que no hayan sido capturadas aún en Payments API
    for (const omsOrd of omsMatchList) {
      const primaryTxId = omsOrd.paymentData?.transactions?.[0]?.transactionId;
      const omsKey = String(omsOrd.sequence || '');
      const omsBaseOrderId = String(omsOrd.orderId || '').replace(/-\d+$/, '');

      const isDuplicate =
        (primaryTxId && seenKeys.has(primaryTxId)) ||
        (omsKey && seenKeys.has(omsKey)) ||
        (omsBaseOrderId && seenKeys.has(omsBaseOrderId));

      if (!isDuplicate) {
        if (primaryTxId) seenKeys.add(primaryTxId);
        if (omsKey) seenKeys.add(omsKey);
        if (omsBaseOrderId) seenKeys.add(omsBaseOrderId);

        rawItemsToProcess.push({
          id: primaryTxId || omsOrd.orderId,
          transactionId: primaryTxId,
          orderId: omsOrd.orderId,
          referenceKey: omsOrd.sequence,
          startDate: omsOrd.creationDate,
          status: omsOrd.status,
          value: omsOrd.value,
        });
      }
    }

    const enrichedList = await Promise.all(
      rawItemsToProcess.map(async (txSummary) => {
        const txId = txSummary.transactionId || (txSummary.id && !txSummary.id.includes('-') ? txSummary.id : null);
        let txDetail = txId ? await fetchVtexTransactionDetail(txId).catch(() => null) : null;
        if (!txDetail) txDetail = txSummary;

        const assocOrderId =
          txDetail.orderId ||
          txDetail.fields?.find((f) => f.name === 'orderId')?.value ||
          txDetail.referenceKey ||
          txSummary.orderId;

        let orderDetail = null;
        if (assocOrderId) {
          orderDetail = await fetchVtexOrderDetail(assocOrderId).catch(() => null);
        }

        const [interactions, payments] = await Promise.all([
          txId ? fetchVtexTransactionInteractions(txId).catch(() => []) : Promise.resolve([]),
          txId ? fetchVtexTransactionPayments(txId).catch(() => []) : Promise.resolve([]),
        ]);

        return await buildEnrichedTransaction(txDetail, orderDetail, interactions, payments);
      })
    );

    // FILTRADO POR FECHA (Zona Horaria Nicaragua America/Managua UTC-6)
    let filteredList = enrichedList;

    if (startDateParam && endDateParam && !searchFilter) {
      filteredList = filteredList.filter((item) => {
        if (!item.startDate) return true;
        const itemNicDate = getNicDateString(item.startDate);
        if (!itemNicDate) return true;
        return itemNicDate >= startDateParam && itemNicDate <= endDateParam;
      });
    }

    // FILTRADO POR ESTADO
    if (statusFilter && statusFilter !== 'all') {
      filteredList = filteredList.filter((item) => {
        const st = (item.status || '').toLowerCase();
        if (statusFilter === 'approved') return st === 'approved' || st === 'completed' || st === 'finished';
        if (statusFilter === 'canceled' || statusFilter === 'cancelled' || statusFilter === 'refused') {
          return st === 'canceled' || st === 'refused' || st === 'payment-denied' || item.errorDiagnostics?.isRefund;
        }
        if (statusFilter === 'refunded' || statusFilter === 'devolucion') {
          return item.errorDiagnostics?.isRefund;
        }
        if (statusFilter === 'pending') return st.includes('pending') || st.includes('authoriz');
        return st === statusFilter;
      });
    }

    // FILTRADO POR BÚSQUEDA FLEXIBLE
    if (searchFilter) {
      const qWords = searchFilter.toLowerCase().trim().split(/\s+/).filter(Boolean);

      filteredList = filteredList.filter((item) => {
        const targetText = [
          item.key,
          item.transactionId,
          item.orderId,
          item.client?.name,
          item.client?.email,
          item.client?.phone,
          item.client?.document,
          item.payment?.systemName,
          item.payment?.cardNumber,
          item.payment?.cardHolder,
          item.payment?.tid,
          item.payment?.authId,
          item.payment?.returnCode,
          item.errorDiagnostics?.title,
          item.errorDiagnostics?.description,
          ...(item.skus || []).map((s) => `${s.id} ${s.name}`),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return qWords.every((word) => targetText.includes(word));
      });
    }

    // Ordenar cronológicamente descendente
    filteredList.sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));

    // Calcular Métricas
    const totalTransactions = filteredList.length;
    let approvedCount = 0;
    let canceledCount = 0;
    let refundCount = 0;
    let pendingCount = 0;
    let totalApprovedAmount = 0;
    let totalCanceledAmount = 0;
    let totalRefundAmount = 0;

    filteredList.forEach((t) => {
      const st = (t.status || '').toLowerCase();
      if (t.errorDiagnostics?.isRefund) {
        refundCount++;
        totalRefundAmount += t.amount || 0;
      } else if (st === 'approved' || st === 'completed' || st === 'finished') {
        approvedCount++;
        totalApprovedAmount += t.amount || 0;
      } else if (st === 'canceled' || st === 'refused') {
        canceledCount++;
        totalCanceledAmount += t.amount || 0;
      } else {
        pendingCount++;
      }
    });

    const metrics = {
      total: totalTransactions,
      approvedCount,
      canceledCount,
      refundCount,
      pendingCount,
      totalApprovedAmount,
      totalCanceledAmount,
      totalRefundAmount,
      approvalRate: totalTransactions > 0 ? ((approvedCount / totalTransactions) * 100).toFixed(1) : 0,
      cancellationRate: totalTransactions > 0 ? ((canceledCount / totalTransactions) * 100).toFixed(1) : 0,
    };

    // Persistir/Actualizar automáticamente las transacciones en Supabase (tabla vtex_transactions)
    if (isSupabaseConfigured() && enrichedList.length > 0) {
      try {
        const dbPayloads = enrichedList.map((tx) => ({
          transaction_id: String(tx.transactionId || tx.key || tx.orderId),
          order_id: tx.orderId || null,
          status: tx.status || 'Pending',
          start_date: tx.startDate || new Date().toISOString(),
          client_name: tx.client?.name || null,
          client_email: tx.client?.email || null,
          client_phone: tx.client?.phone || null,
          client_document: tx.client?.document || null,
          payment_system: tx.payment?.systemName || null,
          card_number: tx.payment?.cardNumber || null,
          card_holder: tx.payment?.cardHolder || null,
          amount: tx.amount || 0,
          acquirer: tx.payment?.acquirer || null,
          tid: tx.payment?.tid || null,
          auth_id: tx.payment?.authId || null,
          return_code: tx.payment?.returnCode || null,
          return_message: tx.payment?.returnMessage || null,
          error_code: tx.errorDiagnostics?.code || null,
          error_title: tx.errorDiagnostics?.title || null,
          error_description: tx.errorDiagnostics?.description || null,
          is_error: tx.errorDiagnostics?.isError || false,
          is_refund: tx.errorDiagnostics?.isRefund || false,
          cancel_reason: tx.errorDiagnostics?.cancelReason || null,
          items: tx.skus || [],
          raw_payload: tx,
          updated_at: new Date().toISOString(),
        }));

        await supabaseAdmin
          .from('vtex_transactions')
          .upsert(dbPayloads, { onConflict: 'transaction_id' });

        // Evaluar en segundo plano devoluciones no notificados a GA4
        for (const payload of dbPayloads) {
          if (payload.is_refund || payload.status === 'Refunded') {
            await handleGa4RefundDispatch(payload);
          }
        }
      } catch (dbErr) {
        console.warn('Aviso guardando en vtex_transactions Supabase:', dbErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      data: filteredList,
      metrics,
      paging: txBatch.paging || { total: totalTransactions, pages: 1, currentPage: 1 },
    });
  } catch (err) {
    console.error('Error en /api/transactions:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * Función normalizadora que combina VTEX Payment Transaction + Payments Array + OMS Order Detail
 */
async function buildEnrichedTransaction(txDetail, orderDetail, interactions = [], payments = []) {
  const getField = (name) => {
    const f = txDetail?.fields?.find((item) => item.name === name);
    if (!f || !f.value) return null;
    try {
      return JSON.parse(f.value);
    } catch (e) {
      return f.value;
    }
  };

  const parsedClient = getField('clientProfileData');
  const parsedCart = getField('cart');
  const parsedShipping = getField('shippingData');

  const paymentObj = payments[0] || orderDetail?.paymentData?.transactions?.[0]?.payments?.[0] || {};
  const connectorResp = paymentObj.connectorResponse || paymentObj.ConnectorResponses || paymentObj.connectorResponses || {};

  // 1. Claves e identificadores
  const key = txDetail?.referenceKey || orderDetail?.sequence || 'N/A';
  const orderId = orderDetail?.orderId || txDetail?.orderId || txDetail?.fields?.find((f) => f.name === 'orderId')?.value || 'N/A';
  const transactionId = txDetail?.id || txDetail?.transactionId || orderDetail?.paymentData?.transactions?.[0]?.transactionId || 'N/A';

  // 2. Estado normalizado
  let rawStatus = txDetail?.status || orderDetail?.statusDescription || orderDetail?.status || 'Unknown';
  let status = normalizeStatus(rawStatus);

  // 3. Monto y Moneda
  let rawValue = 0;
  if (txDetail?.value !== undefined && txDetail?.value !== null) {
    rawValue = txDetail.value / 100;
  } else if (orderDetail?.value !== undefined) {
    rawValue = orderDetail.value / 100;
  }
  const amount = rawValue;
  const currency = txDetail?.currencyCode || 'NIO';

  // 4. Datos del Cliente
  const clientProfile = orderDetail?.clientProfileData || parsedClient || {};
  let firstName = clientProfile.firstName || parsedClient?.firstName || '';
  let lastName = clientProfile.lastName || parsedClient?.lastName || '';
  let clientName = `${firstName} ${lastName}`.trim();

  if (!clientName || clientName === '') {
    const cardHolderField = getField('cardHolder');
    if (cardHolderField) clientName = cardHolderField;
  }

  if (!clientName || clientName === '') {
    clientName = parsedClient?.email || clientProfile?.email || 'Cliente General';
  }

  // Priorizar el correo real del cliente (proveniente de pasarela/parsedClient) sobre el correo enmascarado (@ct.vtex.com.br)
  let clientEmail = 'N/A';
  const txEmail = parsedClient?.email;
  const omsEmail = orderDetail?.clientProfileData?.email;

  if (txEmail && !txEmail.includes('@ct.vtex.com.br')) {
    clientEmail = txEmail;
  } else if (omsEmail && !omsEmail.includes('@ct.vtex.com.br')) {
    clientEmail = omsEmail;
  } else {
    clientEmail = txEmail || omsEmail || 'N/A';
  }

  const clientPhone = clientProfile.phone || parsedClient?.phone || 'N/A';
  const clientDocument = clientProfile.document || parsedClient?.document || 'N/A';

  // 5. Método de Pago, Tarjeta y Códigos de Pasarela
  let paymentSystemName = paymentObj.paymentSystemName || paymentObj.paymentSystem || getField('paymentMethod');
  if (!paymentSystemName && interactions.length > 0) {
    const authLog = interactions.find((i) => i.Message && i.Message.includes('Sending authorization request'));
    if (authLog) {
      if (authLog.Message.includes('"paymentMethod":"Visa"')) paymentSystemName = 'Visa';
      else if (authLog.Message.includes('"paymentMethod":"MasterCard"')) paymentSystemName = 'MasterCard';
      else if (authLog.Message.includes('"paymentMethod":"Amex"')) paymentSystemName = 'American Express';
    }
  }

  if (!paymentSystemName) {
    paymentSystemName = 'Tarjeta de Crédito/Débito';
  }

  const firstDigits = paymentObj.firstDigits || getField('firstDigits') || '';
  const lastDigits = paymentObj.lastDigits || getField('lastDigits') || '';
  const cardNumberFormatted = firstDigits && lastDigits ? `${firstDigits}******${lastDigits}` : (lastDigits ? `**** ${lastDigits}` : 'N/A');
  const cardHolder = paymentObj.cardHolder || getField('cardHolder') || clientName;

  const acquirer = connectorResp.acquirer || connectorResp.Acquirer || 'Tilopay';
  const tid = paymentObj.tid || connectorResp.Tid || connectorResp.tid || getField('tid') || 'N/A';
  let authId = connectorResp.authId || connectorResp.AuthId || connectorResp.authorizationId || getField('authorizationId') || 'N/A';

  if (authId === 'N/A' && interactions.length > 0) {
    const authMatch = interactions.map((i) => i.Message || '').join(' ').match(/"authorizationId":"([^"]+)"/i);
    if (authMatch) authId = authMatch[1];
  }

  const returnCode = paymentObj.returnCode || connectorResp.ReturnCode || connectorResp.returnCode || connectorResp.code || getField('returnCode') || null;
  const returnMessage = paymentObj.returnMessage || connectorResp.Message || connectorResp.message || getField('returnMessage') || null;

  // 6. Diagnóstico Traducido al Español & Detección de Devoluciones / Anulaciones Post-Venta
  const isApproved = status === 'Approved' || status === 'Completed' || status === 'Finished';
  const isCanceledState = status === 'Canceled' || status === 'Refused' || status === 'payment-denied';

  let errorDiagnostics = null;

  // Si fue Aprobada originalmente por el banco y luego Anulada/Devuelta por Servicio al Cliente / Post-Venta
  const hasAuthCode = authId && authId !== 'N/A' && authId.trim() !== '';
  const hasSosLog = interactions.some((i) => i.Message && i.Message.includes('sos-api'));
  const isPostSaleRefund = isCanceledState && (hasAuthCode || hasSosLog);

  // Extract VTEX cancellation reason entered by agent or system
  const vtexCancelReason =
    orderDetail?.cancelReason ||
    (typeof orderDetail?.cancellationData === 'object'
      ? (orderDetail.cancellationData?.reason || orderDetail.cancellationData?.Reason)
      : orderDetail?.cancellationData) ||
    (typeof orderDetail?.openTextField === 'object'
      ? orderDetail.openTextField?.value
      : orderDetail?.openTextField) ||
    null;

  if (isApproved) {
    errorDiagnostics = {
      isError: false,
      isRefund: false,
      code: '00',
      title: 'Transacción Aprobada Exitosamente',
      description: 'El pago fue procesado y autorizado correctamente por la pasarela de pago (Tilopay) y el banco emisor.',
      cancelReason: null,
      returnMessage: 'OK / Exitoso',
    };
  } else if (isPostSaleRefund) {
    errorDiagnostics = {
      isError: false,
      isRefund: true,
      code: 'DEVOLUCION_POSTVENTA',
      title: '🔄 Devolución / Anulación Post-Venta',
      description: `Esta transacción fue autorizada exitosamente por el banco emisor (Código de Autorización: ${authId}), pero posteriormente fue anulada o reembolsada a través del sistema de post-venta / servicio al cliente de SINSA.`,
      cancelReason: vtexCancelReason || 'Anulación por servicio al cliente / reembolso post-venta',
      returnMessage: `Devolución Procesada en Pasarela (AuthId: ${authId})`,
    };
  } else {
    const errorTranslation = translateError(returnCode, returnMessage || vtexCancelReason, interactions);
    errorDiagnostics = {
      isError: true,
      isRefund: false,
      code: returnCode || errorTranslation.code,
      title: errorTranslation.title,
      description: errorTranslation.description,
      cancelReason: vtexCancelReason || null,
      returnMessage: returnMessage || null,
    };
  }

  // 7. Lista de SKUs / Productos
  let rawItems = orderDetail?.items || parsedCart?.items || [];
  const items = await Promise.all(
    rawItems.map(async (it) => {
      const rawPrice = it.sellingPrice !== undefined ? it.sellingPrice : (it.price !== undefined ? it.price : (it.value || 0));
      // Los precios de items en VTEX OMS y Payments API vienen expresados en centavos (ej: 38985 centavos = C$ 389.85)
      let unitPrice = 0;
      if (typeof rawPrice === 'number') {
        unitPrice = rawPrice > 0 && (it.sellingPrice !== undefined || it.listPrice !== undefined || rawPrice >= 100) ? rawPrice / 100 : rawPrice;
      } else {
        unitPrice = Number(rawPrice) / 100 || 0;
      }
      const qty = it.quantity || 1;
      const skuId = String(it.id || it.skuId || it.sellerSku || '');
      const imageUrl = await fetchSkuImageUrl(skuId, it.imageUrl);

      return {
        id: skuId,
        name: it.name || it.skuName || `SKU ${skuId}`,
        quantity: qty,
        unitPrice: unitPrice,
        totalPrice: unitPrice * qty,
        imageUrl: imageUrl,
        brand: it.additionalInfo?.brandName || 'SINSA',
        refId: it.refId || skuId,
      };
    })
  );

  // 8. Dirección de Entrega / Retiro
  const shippingAddress = orderDetail?.shippingData?.address || parsedShipping || {};
  const isPickup = orderDetail?.shippingData?.logisticsInfo?.[0]?.deliveryChannel === 'pickup-in-point' || shippingAddress.addressType === 'pickup';

  const shipping = {
    addressType: isPickup ? 'Retiro en Tienda' : 'Envío a Domicilio',
    receiverName: shippingAddress.receiverName || clientName,
    street: shippingAddress.street || 'N/A',
    complement: shippingAddress.complement || '',
    city: shippingAddress.city || 'Managua',
    state: shippingAddress.state || 'Managua',
    country: shippingAddress.country || 'NIC',
    postalCode: shippingAddress.postalCode || '',
    fullAddressFormatted: [
      shippingAddress.street,
      shippingAddress.complement,
      shippingAddress.city,
      shippingAddress.state,
    ]
      .filter(Boolean)
      .join(', '),
  };

  // 9. Metadatos Técnicos
  const ipAddress = txDetail?.ipAddress || txDetail?.fields?.find((f) => f.name === 'ip')?.value || 'N/A';
  const userAgent = txDetail?.userAgent || txDetail?.fields?.find((f) => f.name === 'userAgent')?.value || 'N/A';
  const startDate = txDetail?.startDate || orderDetail?.creationDate || new Date().toISOString();

  return {
    key,
    orderId,
    transactionId,
    status: isPostSaleRefund ? 'Refunded' : status,
    rawStatus,
    amount,
    currency,
    startDate,
    client: {
      name: clientName,
      email: clientEmail,
      phone: clientPhone,
      document: clientDocument,
    },
    payment: {
      systemName: paymentSystemName,
      cardNumber: cardNumberFormatted,
      cardHolder,
      acquirer,
      tid,
      authId,
      returnCode: isApproved ? '00' : isPostSaleRefund ? 'DEVOLUCION' : (returnCode || 'N/A'),
      returnMessage: isApproved ? 'OK / Exitoso' : isPostSaleRefund ? 'Anulación Post-Venta' : returnMessage,
    },
    errorDiagnostics,
    skus: items,
    shipping,
    technical: {
      ipAddress,
      userAgent,
    },
    interactions,
  };
}

function normalizeStatus(raw) {
  if (!raw) return 'Desconocido';
  const s = String(raw).toLowerCase();

  if (
    s.includes('approved') ||
    s.includes('completed') ||
    s.includes('finished') ||
    s.includes('handling') ||
    s.includes('pronto') ||
    s.includes('manuseio') ||
    s.includes('invoiced') ||
    s.includes('faturado') ||
    s.includes('ready')
  ) {
    return 'Approved';
  }
  if (s.includes('cancel') || s.includes('refus') || s.includes('denied') || s.includes('recusad')) {
    return 'Canceled';
  }
  if (s.includes('pend') || s.includes('authoriz') || s.includes('waiting') || s.includes('aguardando')) {
    return 'Pending';
  }
  return raw;
}
