/**
 * Script generador de archivos de prueba masiva para el Comparador Xstore vs Web.
 * Extrae SKUs reales de la base de datos Supabase (vtex_skus) y genera un archivo
 * Excel (.xlsx) y/o CSV (.csv) con 5,000, 25,000, 50,000 o 100,000 filas con casos
 * realistas (coincidencias, discrepancias y no encontrados).
 *
 * Uso:
 *   node --env-file=.env.local scripts/generate-test-excel.js [cantidad] [formato]
 * Ejemplos:
 *   node --env-file=.env.local scripts/generate-test-excel.js 100000 csv
 *   node --env-file=.env.local scripts/generate-test-excel.js 25000 xlsx
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const args = process.argv.slice(2);
const TARGET_COUNT = parseInt(args[0], 10) || 100000;
const FORMAT = (args[1] || 'csv').toLowerCase(); // 'csv' o 'xlsx'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log(`\n======================================================`);
  console.log(` Generador de Pruebas Masivas SINSA: ${TARGET_COUNT.toLocaleString()} SKUs`);
  console.log(` Formato: ${FORMAT.toUpperCase()}`);
  console.log(`======================================================\n`);

  console.time('Tiempo de consulta a Supabase');
  console.log(`Consultando SKUs reales en public.vtex_skus...`);

  // Supabase limita a 1,000 filas por consulta sin paginación por rango
  const CHUNK_SIZE = 1000;
  const targetSkusToFetch = Math.min(TARGET_COUNT, 84000);
  const totalChunks = Math.ceil(targetSkusToFetch / CHUNK_SIZE);
  const realSkus = [];

  // Consultar en paralelo con concurrencia de 8
  const CONCURRENCY = 8;
  for (let i = 0; i < totalChunks; i += CONCURRENCY) {
    const chunkPromises = [];
    for (let j = 0; j < CONCURRENCY && i + j < totalChunks; j++) {
      const chunkIdx = i + j;
      const start = chunkIdx * CHUNK_SIZE;
      const end = start + CHUNK_SIZE - 1;
      chunkPromises.push(
        supabase
          .from('vtex_skus')
          .select('id, name, base_price, final_price, list_price')
          .range(start, end)
      );
    }

    const results = await Promise.all(chunkPromises);
    for (const res of results) {
      if (res.data) {
        realSkus.push(...res.data);
      }
    }
    process.stdout.write(`\rSKUs reales descargados: ${realSkus.length.toLocaleString()}/${targetSkusToFetch.toLocaleString()}`);
  }

  console.log(`\nSKUs reales obtenidos: ${realSkus.length.toLocaleString()}`);
  console.timeEnd('Tiempo de consulta a Supabase');

  console.time('Generación de filas y variaciones');
  console.log(`\nSimulando precios de Xstore con escenarios realistas...`);

  // Columnas esperadas por el comparador:
  // "SKU ID", "Precio Xstore Facturacion", "Descripcion"
  const rows = [];
  rows.push(['SKU ID', 'Precio Xstore Facturacion', 'Descripcion']);

  let matchSim = 0;
  let mismatchSim = 0;
  let notFoundSim = 0;

  for (let i = 0; i < TARGET_COUNT; i++) {
    let skuId;
    let description;
    let xstorePrice;

    // Caso 1: 95% de las filas usan SKUs reales de la base de datos
    // Caso 2: 5% son SKUs no encontrados (ej. códigos inventados para auditar no encontrados)
    const isNotFound = Math.random() < 0.05 || realSkus.length === 0;

    if (isNotFound) {
      notFoundSim++;
      skuId = 9900000 + i;
      description = `PRODUCTO FUERA DE CATALOGO SIMULADO #${i + 1}`;
      xstorePrice = parseFloat((Math.random() * 800 + 50).toFixed(2));
    } else {
      const baseItem = realSkus[i % realSkus.length];
      skuId = baseItem.id;
      description = baseItem.name || `PRODUCTO SINSA ${skuId}`;

      const webRealPrice = Number(baseItem.final_price ?? baseItem.base_price ?? baseItem.list_price ?? 120);

      // Distribuir escenarios:
      // ~80% Coinciden exactamente
      // ~12% Discrepancia: Precio Xstore menor (Web más cara)
      // ~8% Discrepancia: Precio Xstore mayor (Web más barata / promo)
      const scenario = Math.random();
      if (scenario < 0.80) {
        matchSim++;
        xstorePrice = webRealPrice;
      } else if (scenario < 0.92) {
        mismatchSim++;
        // Web es mayor por un porcentaje aleatorio
        xstorePrice = Math.max(1, parseFloat((webRealPrice * 0.85).toFixed(2)));
      } else {
        mismatchSim++;
        // Web es menor (promo en web)
        xstorePrice = parseFloat((webRealPrice * 1.18).toFixed(2));
      }
    }

    rows.push([skuId, xstorePrice, description]);
  }

  console.timeEnd('Generación de filas y variaciones');
  console.log(`Distribución simulada para prueba:`);
  console.log(`  - 🟢 Coinciden: ${matchSim.toLocaleString()} (~${((matchSim / TARGET_COUNT) * 100).toFixed(1)}%)`);
  console.log(`  - 🔴 Discrepancias: ${mismatchSim.toLocaleString()} (~${((mismatchSim / TARGET_COUNT) * 100).toFixed(1)}%)`);
  console.log(`  - ⚪ No encontrados en Web: ${notFoundSim.toLocaleString()} (~${((notFoundSim / TARGET_COUNT) * 100).toFixed(1)}%)`);

  const outputDir = path.resolve(process.cwd(), 'public');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = `prueba_xstore_${TARGET_COUNT >= 1000 ? `${TARGET_COUNT / 1000}k` : TARGET_COUNT}_skus.${FORMAT}`;
  const outputPath = path.join(outputDir, fileName);

  console.time(`Guardando archivo ${fileName}`);

  if (FORMAT === 'csv') {
    // Formato CSV ultra-eficiente con UTF-8 BOM para apertura perfecta en Excel
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = '\uFEFF' + rows.map((r) => r.map(escapeCsv).join(',')).join('\r\n');
    fs.writeFileSync(outputPath, csvContent, 'utf8');
  } else {
    // Formato XLSX
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Facturacion_Xstore');
    XLSX.writeFile(wb, outputPath);
  }

  console.timeEnd(`Guardando archivo ${fileName}`);
  const stats = fs.statSync(outputPath);
  console.log(`\n Archivo generado exitosamente:`);
  console.log(`   Ruta: ${outputPath}`);
  console.log(`   Tamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Total filas: ${(rows.length - 1).toLocaleString()}\n`);
}

run().catch((err) => {
  console.error('Error generando archivo de prueba:', err);
  process.exit(1);
});
