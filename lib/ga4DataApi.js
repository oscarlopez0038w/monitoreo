import { SignJWT, importPKCS8 } from 'jose';

/**
 * Módulo de Integración con Google Analytics 4 Data API (GA4 RunReport)
 * Permite consultar métricas reales de sesiones, usuarios y eventos e-commerce
 * utilizando la propiedad GA4_PROPERTY_ID y Service Account JWT authentication.
 */

/**
 * Verifica el estado de configuración de GA4 Data API en el entorno.
 */
export function getGa4ConfigStatus() {
  const propertyId = process.env.GA4_PROPERTY_ID || null;
  const measurementId = process.env.GA4_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || null;
  const apiSecret = process.env.GA4_API_SECRET || null;
  const clientEmail = process.env.GA4_CLIENT_EMAIL || null;
  const privateKey = process.env.GA4_PRIVATE_KEY || null;

  const isPropertyConfigured = Boolean(propertyId);
  const isMeasurementConfigured = Boolean(measurementId);
  const isApiSecretConfigured = Boolean(apiSecret);
  const isServiceAccountConfigured = Boolean(clientEmail && privateKey);

  return {
    propertyId,
    measurementId,
    isPropertyConfigured,
    isMeasurementConfigured,
    isApiSecretConfigured,
    isServiceAccountConfigured,
    canFetchLiveReport: isPropertyConfigured && isServiceAccountConfigured,
  };
}

/**
 * Genera un Access Token OAuth2 para Google APIs usando la Service Account y la librería `jose`.
 */
async function getGoogleAccessToken() {
  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  let privateKey = process.env.GA4_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error('Faltan credenciales de Google Service Account (GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY)');
  }

  // Formatear private key si viene con saltos de línea escapados
  privateKey = privateKey.replace(/\\n/g, '\n');

  try {
    const alg = 'RS256';
    const ecPrivateKey = await importPKCS8(privateKey, alg);

    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
      .setProtectedHeader({ alg, typ: 'JWT' })
      .sign(ecPrivateKey);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error obteniendo access token de Google (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Error generando OAuth token para GA4 Data API:', error);
    throw error;
  }
}

/**
 * Ejecuta un reporte básico en GA4 Data API para obtener Sesiones y Usuarios activos
 * entre startDate y endDate (formato YYYY-MM-DD).
 */
export async function fetchGa4FunnelMetrics(startDate, endDate) {
  const status = getGa4ConfigStatus();

  if (!status.canFetchLiveReport) {
    return {
      success: false,
      reason: 'Se requiere GA4_PROPERTY_ID y credenciales de Service Account en .env.local',
      configStatus: status,
    };
  }

  try {
    const accessToken = await getGoogleAccessToken();
    const propertyId = status.propertyId.replace(/^properties\//, '');

    const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

    const requestBody = {
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'screenPageViews' },
        { name: 'eventCount' },
      ],
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.warn(`GA4 Data API report returned ${res.status}:`, errorText);
      return { success: false, status: res.status, error: errorText, configStatus: status };
    }

    const json = await res.json();
    const values = json?.rows?.[0]?.metricValues || [];

    const sessions = parseInt(values[0]?.value || '0', 10);
    const activeUsers = parseInt(values[1]?.value || '0', 10);
    const pageViews = parseInt(values[2]?.value || '0', 10);
    const eventCount = parseInt(values[3]?.value || '0', 10);

    return {
      success: true,
      sessions,
      activeUsers,
      pageViews,
      eventCount,
      configStatus: status,
    };
  } catch (err) {
    console.error('Error consultando GA4 Data API:', err.message);
    return {
      success: false,
      error: err.message,
      configStatus: status,
    };
  }
}
