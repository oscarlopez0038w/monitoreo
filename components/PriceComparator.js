'use client';

import { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Scale,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileText,
  X,
  Search,
  Download,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal,
  FileSpreadsheet,
  Tag,
  Percent,
} from 'lucide-react';

const CHUNK_SIZE = 5000; // 5,000 SKUs por lote para streaming confiable sin timeouts

// Helper para recalcular una fila al cambiar de modo en memoria (instantáneo en <10ms para 100k)
function recalculateRow(r, mode) {
  if (r.status === 'NOT_FOUND' || (r.basePrice === null && r.webFinalPrice === null)) {
    return {
      ...r,
      targetWebPrice: null,
      diffAmount: null,
      diffPercent: null,
      status: 'NOT_FOUND',
      statusText: 'No Encontrado en Web',
      badgeColor: '#94a3b8',
    };
  }

  // En modo 'base': Compara contra el precio base regular sin descuento
  // En modo 'final': Compara contra el precio final con promociones y descuentos
  const targetWebPrice =
    mode === 'base'
      ? (r.basePrice ?? r.webFinalPrice ?? 0)
      : (r.webFinalPrice ?? r.basePrice ?? 0);

  const diffAmount = targetWebPrice - r.xstorePrice;
  const absDiff = Math.abs(diffAmount);

  if (absDiff < 0.01) {
    return {
      ...r,
      targetWebPrice,
      diffAmount: 0,
      diffPercent: 0,
      status: 'MATCH',
      statusText: '🟢 Precios Coinciden',
      badgeColor: '#34d399',
    };
  }

  const diffPercent = r.xstorePrice > 0 ? (diffAmount / r.xstorePrice) * 100 : 0;

  if (diffAmount > 0) {
    return {
      ...r,
      targetWebPrice,
      diffAmount,
      diffPercent,
      status: 'MISMATCH_HIGHER',
      statusText: mode === 'base' ? '🔴 Base Web Mayor' : '🔴 Precio Web Mayor',
      badgeColor: '#f87171',
    };
  } else {
    return {
      ...r,
      targetWebPrice,
      diffAmount,
      diffPercent,
      status: 'MISMATCH_LOWER',
      statusText: mode === 'base' ? '🟡 Base Web Menor' : '🟡 Precio Web Menor',
      badgeColor: '#fbbf24',
    };
  }
}

// Helper para recalcular estadísticas globales
function calculateStatsFromResults(results) {
  let matchCount = 0;
  let mismatchCount = 0;
  let notFoundCount = 0;
  let higherWebCount = 0;
  let lowerWebCount = 0;

  for (const r of results) {
    if (r.status === 'MATCH') matchCount++;
    else if (r.status === 'MISMATCH_HIGHER') {
      mismatchCount++;
      higherWebCount++;
    } else if (r.status === 'MISMATCH_LOWER') {
      mismatchCount++;
      lowerWebCount++;
    } else if (r.status === 'NOT_FOUND') {
      notFoundCount++;
    }
  }

  const totalAudited = results.length;
  const matchPercentage =
    totalAudited > 0 ? ((matchCount / totalAudited) * 100).toFixed(1) : '0';

  return {
    totalAudited,
    matchCount,
    mismatchCount,
    notFoundCount,
    higherWebCount,
    lowerWebCount,
    matchPercentage,
  };
}

export default function PriceComparator() {
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null); // { current, total, percentage, currentBatch, totalBatches }
  const [auditData, setAuditData] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'mismatch' | 'match' | 'not_found'
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modo de comparación: 'base' (sin descuento / regular) | 'final' (con descuentos y promociones)
  const [comparisonMode, setComparisonMode] = useState('base');

  // Paginación de alto rendimiento
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pageJumpInput, setPageJumpInput] = useState('');

  // Referencia para cancelar auditoría en curso
  const abortControllerRef = useRef(null);

  // Helper para procesar hojas Excel o CSV
  const parseSheet = (worksheet) => {
    const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!matrix || matrix.length === 0) return { rows: [] };

    // Buscar fila de encabezado en las primeras 20 filas
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(matrix.length, 20); i++) {
      const rowStr = matrix[i].map((c) => String(c).trim().toLowerCase()).join(' ');
      if (
        rowStr.includes('sku') ||
        rowStr.includes('codigo') ||
        rowStr.includes('precio') ||
        rowStr.includes('xstore')
      ) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      headerRowIdx = matrix.findIndex((r) => r.some((cell) => String(cell).trim().length > 0));
      if (headerRowIdx === -1) headerRowIdx = 0;
    }

    const headers = matrix[headerRowIdx].map((c) => String(c).trim());
    const lowerHeaders = headers.map((h) => h.toLowerCase());

    let skuIdx = lowerHeaders.findIndex(
      (h) => h === 'sku' || h === 'sku id' || h === 'sku_id' || h === 'id' || h.includes('sku') || h.includes('codigo')
    );
    if (skuIdx === -1) skuIdx = 0;

    let priceIdx = lowerHeaders.findIndex(
      (h) =>
        h.includes('xstore') ||
        h.includes('facturac') ||
        h.includes('precio') ||
        h.includes('price') ||
        h.includes('venta')
    );
    if (priceIdx === -1) priceIdx = 1;

    let descIdx = lowerHeaders.findIndex(
      (h) => h.includes('descrip') || h.includes('nombre') || h.includes('product')
    );

    const dataRows = matrix.slice(headerRowIdx + 1);
    const rows = [];

    for (const r of dataRows) {
      const rawSku = r[skuIdx];
      if (rawSku == null || rawSku === '') continue;

      const cleanSkuStr = String(rawSku).replace(/\.0$/, '').trim();
      const skuNum = parseInt(cleanSkuStr, 10);
      if (isNaN(skuNum) || skuNum <= 0) continue;

      const rawPrice = r[priceIdx];
      const xstorePrice =
        typeof rawPrice === 'number'
          ? rawPrice
          : parseFloat(String(rawPrice).replace(/,/g, '').replace(/C\$/gi, '').trim()) || 0;

      const desc = descIdx !== -1 && r[descIdx] ? String(r[descIdx]).trim() : null;

      rows.push({
        skuId: skuNum,
        xstorePrice: Math.max(0, xstorePrice),
        description: desc,
      });
    }

    return { rows };
  };

  // Cambiar modo de comparación dinámicamente
  const handleModeChange = (newMode) => {
    if (newMode === comparisonMode) return;
    setComparisonMode(newMode);

    // Si ya tenemos resultados cargados en memoria, recalculamos al vuelo instantáneamente (<10ms)
    if (auditData?.results && auditData.results.length > 0) {
      const updatedResults = auditData.results.map((r) => recalculateRow(r, newMode));
      const updatedStats = calculateStatsFromResults(updatedResults);
      setAuditData({
        comparisonMode: newMode,
        stats: updatedStats,
        results: updatedResults,
      });
      setCurrentPage(1);
    }
  };

  // Procesador por lotes (streaming chunking)
  const processAuditChunks = async (rows, labelName) => {
    setFileName(labelName);
    setLoading(true);
    setAuditData(null);
    setCurrentPage(1);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const totalRows = rows.length;
    const totalBatches = Math.ceil(totalRows / CHUNK_SIZE);

    setProgress({
      current: 0,
      total: totalRows,
      percentage: 0,
      currentBatch: 0,
      totalBatches,
    });

    const accumulatedResults = [];
    const accumulatedStats = {
      totalAudited: 0,
      matchCount: 0,
      mismatchCount: 0,
      notFoundCount: 0,
      higherWebCount: 0,
      lowerWebCount: 0,
      matchPercentage: '0',
    };

    try {
      for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
        if (controller.signal.aborted) {
          console.warn('Auditoría cancelada por el usuario.');
          break;
        }

        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const currentBatchNum = Math.floor(i / CHUNK_SIZE) + 1;

        const res = await fetch('/api/prices/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: chunk, comparisonMode }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Error del servidor (Status ${res.status})`);
        }

        const auditRes = await res.json();
        if (!auditRes.success) {
          throw new Error(auditRes.error || 'Fallo desconocido en lote');
        }

        // Acumular estadísticas
        accumulatedStats.totalAudited += auditRes.stats.totalAudited;
        accumulatedStats.matchCount += auditRes.stats.matchCount;
        accumulatedStats.mismatchCount += auditRes.stats.mismatchCount;
        accumulatedStats.notFoundCount += auditRes.stats.notFoundCount;
        accumulatedStats.higherWebCount += auditRes.stats.higherWebCount;
        accumulatedStats.lowerWebCount += auditRes.stats.lowerWebCount;
        accumulatedStats.matchPercentage =
          accumulatedStats.totalAudited > 0
            ? ((accumulatedStats.matchCount / accumulatedStats.totalAudited) * 100).toFixed(1)
            : '0';

        accumulatedResults.push(...auditRes.results);

        const currentCount = Math.min(totalRows, i + chunk.length);
        const percentage = Math.round((currentCount / totalRows) * 100);

        setProgress({
          current: currentCount,
          total: totalRows,
          percentage,
          currentBatch: currentBatchNum,
          totalBatches,
        });

        // Actualizar datos periódicamente para que los contadores en vivo se animen
        if (currentBatchNum % 2 === 0 || currentBatchNum === totalBatches) {
          setAuditData({
            comparisonMode,
            stats: { ...accumulatedStats },
            results: [...accumulatedResults],
          });
        }
      }

      // Asegurar estado final completo
      setAuditData({
        comparisonMode,
        stats: { ...accumulatedStats },
        results: accumulatedResults,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        alert('Auditoría cancelada.');
      } else {
        console.error('Error procesando comparación de precios:', err);
        alert('Error en auditoría: ' + err.message);
      }
    } finally {
      setLoading(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  // Cargar archivo desde el explorador
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        alert('El archivo Excel no contiene hojas de cálculo.');
        setLoading(false);
        return;
      }

      let bestSheetName = workbook.SheetNames[0];
      let bestResult = parseSheet(workbook.Sheets[bestSheetName]);

      for (let i = 1; i < workbook.SheetNames.length; i++) {
        const sheetName = workbook.SheetNames[i];
        const res = parseSheet(workbook.Sheets[sheetName]);
        if (res.rows.length > bestResult.rows.length) {
          bestSheetName = sheetName;
          bestResult = res;
        }
      }

      if (bestResult.rows.length === 0) {
        alert('No se encontraron SKUs válidos. Asegúrate de incluir las columnas "SKU ID" y "Precio Xstore Facturacion".');
        setLoading(false);
        return;
      }

      await processAuditChunks(bestResult.rows, file.name);
    } catch (err) {
      console.error('Error leyendo archivo:', err);
      alert('Error leyendo el archivo: ' + err.message);
      setLoading(false);
    }
  };

  // Cancelar procesamiento
  const handleCancelAudit = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Exportar reporte a CSV (ultra-rápido, ideal para 100,000 filas sin desbordar memoria)
  const handleExportCSV = (onlyMismatches = false) => {
    if (!auditData || !Array.isArray(auditData.results)) return;

    const sourceRows = onlyMismatches
      ? auditData.results.filter((r) => r.status === 'MISMATCH_HIGHER' || r.status === 'MISMATCH_LOWER')
      : auditData.results;

    const headers = [
      'SKU ID',
      'Descripcion / Producto',
      'Precio Xstore Facturacion (C$)',
      comparisonMode === 'base' ? 'Precio Base Web Regular (C$)' : 'Precio Final Web (C$)',
      'Promocion Web Activa',
      'Descuento Web (%)',
      'Diferencia (C$)',
      'Diferencia (%)',
      'Estado Comparacion',
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [headers.map(escapeCsv).join(',')];

    for (const r of sourceRows) {
      const line = [
        r.skuId,
        r.description || '',
        r.xstorePrice,
        r.targetWebPrice !== null ? r.targetWebPrice : 'No Encontrado',
        r.promoName ? r.promoName : 'Sin promo',
        r.discountPct ? `${r.discountPct}%` : '0%',
        r.diffAmount !== null ? r.diffAmount : 'N/A',
        r.diffPercent !== null ? `${r.diffPercent.toFixed(2)}%` : 'N/A',
        r.statusText,
      ];
      csvLines.push(line.map(escapeCsv).join(','));
    }

    const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const tag = onlyMismatches ? 'Solo_Discrepancias' : 'Completo';
    const modeTag = comparisonMode === 'base' ? 'PrecioBase' : 'PrecioFinal';
    link.setAttribute('download', `Auditoria_${modeTag}_Xstore_vs_Web_${tag}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Exportar reporte de comparación a Excel (.xlsx)
  const handleExportExcel = (onlyMismatches = false) => {
    if (!auditData || !Array.isArray(auditData.results)) return;

    const sourceRows = onlyMismatches
      ? auditData.results.filter((r) => r.status === 'MISMATCH_HIGHER' || r.status === 'MISMATCH_LOWER')
      : auditData.results;

    if (sourceRows.length > 50000 && !onlyMismatches) {
      const confirmExport = confirm(
        `El listado contiene ${sourceRows.length.toLocaleString()} filas. Generar un archivo .xlsx tan grande puede tardar unos segundos. Se recomienda exportar a CSV para velocidad instantánea.\n\n¿Deseas continuar generando el archivo Excel .xlsx?`
      );
      if (!confirmExport) return;
    }

    const exportRows = sourceRows.map((r) => ({
      'SKU ID': r.skuId,
      'Descripción / Producto': r.description,
      'Precio Xstore Facturación (C$)': r.xstorePrice,
      [comparisonMode === 'base' ? 'Precio Base Web Regular (C$)' : 'Precio Final Web (C$)']:
        r.targetWebPrice !== null ? r.targetWebPrice : 'No Encontrado',
      'Promoción Web Activa': r.promoName ? `${r.promoName}${r.discountPct ? ` (-${r.discountPct}%)` : ''}` : 'Sin promo',
      'Diferencia (C$)': r.diffAmount !== null ? r.diffAmount : 'N/A',
      'Diferencia (%)': r.diffPercent !== null ? `${r.diffPercent.toFixed(2)}%` : 'N/A',
      'Estado Comparación': r.statusText,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Comparativa Xstore vs Web');

    worksheet['!cols'] = [
      { wch: 15 },
      { wch: 45 },
      { wch: 25 },
      { wch: 25 },
      { wch: 25 },
      { wch: 18 },
      { wch: 18 },
      { wch: 25 },
    ];

    const tag = onlyMismatches ? 'Solo_Discrepancias' : 'Completo';
    const modeTag = comparisonMode === 'base' ? 'PrecioBase' : 'PrecioFinal';
    XLSX.writeFile(workbook, `Reporte_${modeTag}_Xstore_vs_Web_${tag}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Filtrado memoizado de alto rendimiento (opera en ~10ms sobre 100k registros)
  const filteredResults = useMemo(() => {
    if (!auditData?.results) return [];

    const search = searchTerm.trim().toLowerCase();

    return auditData.results.filter((r) => {
      const matchesFilter =
        filter === 'all'
          ? true
          : filter === 'mismatch'
          ? r.status === 'MISMATCH_HIGHER' || r.status === 'MISMATCH_LOWER'
          : filter === 'match'
          ? r.status === 'MATCH'
          : filter === 'not_found'
          ? r.status === 'NOT_FOUND'
          : true;

      if (!matchesFilter) return false;

      if (!search) return true;

      return (
        String(r.skuId).includes(search) ||
        (r.description && r.description.toLowerCase().includes(search))
      );
    });
  }, [auditData?.results, filter, searchTerm]);

  // Cálculos de Paginación
  const totalFiltered = filteredResults.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  // Filas de la página actual (solo 50-100 en el DOM = 60 FPS garantizados)
  const currentPaginatedRows = useMemo(() => {
    const startIdx = (safeCurrentPage - 1) * pageSize;
    return filteredResults.slice(startIdx, startIdx + pageSize);
  }, [filteredResults, safeCurrentPage, pageSize]);

  // Manejo de cambio de página
  const goToPage = (page) => {
    const target = Math.min(Math.max(1, page), totalPages);
    setCurrentPage(target);
  };

  return (
    <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
      
      {/* Module Title Header & Mode Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0 0 0.35rem 0' }}>
            <Scale size={24} color="#c084fc" />
            Comparador de Precios: Xstore Facturación vs. Web
          </h2>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: 0 }}>
            Audita las columnas <code style={{ color: '#c084fc' }}>SKU ID</code> y <code style={{ color: '#c084fc' }}>Precio Xstore Facturacion</code> contra la base de datos de la tienda Web.
          </p>
        </div>

        {/* Action buttons (CSV / Excel) */}
        {auditData && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Exportar CSV (Ultra Rápido) */}
            <button
              onClick={() => handleExportCSV(false)}
              style={{
                padding: '0.55rem 1rem',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '10px',
                color: '#38bdf8',
                fontWeight: 700,
                fontSize: '0.83rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                transition: 'all 0.2s ease',
              }}
              title="Descarga instantánea recomendada para archivos masivos de más de 20,000 filas"
            >
              <FileSpreadsheet size={15} />
              Exportar CSV
            </button>

            {/* Exportar Solo Discrepancias */}
            {auditData.stats.mismatchCount > 0 && (
              <button
                onClick={() => handleExportCSV(true)}
                style={{
                  padding: '0.55rem 1rem',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: '10px',
                  color: '#f87171',
                  fontWeight: 700,
                  fontSize: '0.83rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  transition: 'all 0.2s ease',
                }}
                title="Exportar únicamente las filas con diferencias de precio para corrección rápida"
              >
                <AlertTriangle size={15} />
                Solo Discrepancias ({auditData.stats.mismatchCount})
              </button>
            )}

            {/* Exportar Excel .xlsx */}
            <button
              onClick={() => handleExportExcel(false)}
              style={{
                padding: '0.55rem 1.1rem',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                borderRadius: '10px',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.83rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
              }}
            >
              <Download size={15} />
              Exportar Excel (.xlsx)
            </button>
          </div>
        )}
      </div>

      {/* Selector de Modo de Comparación: Base vs Final */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.85rem',
          background: 'rgba(15, 23, 42, 0.6)',
          padding: '0.65rem 1rem',
          borderRadius: '14px',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <SlidersHorizontal size={17} color="#a855f7" />
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>
            Comparar archivo Xstore contra:
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Opción 1: Precio Base (Sin Descuento) */}
          <button
            onClick={() => handleModeChange('base')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '9px',
              border: comparisonMode === 'base' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
              background: comparisonMode === 'base' ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.04)',
              color: comparisonMode === 'base' ? '#38bdf8' : '#94a3b8',
              fontSize: '0.83rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              transition: 'all 0.2s ease',
              boxShadow: comparisonMode === 'base' ? '0 0 12px rgba(56, 189, 248, 0.25)' : 'none',
            }}
          >
            <Tag size={15} />
            🏷️ Precio Base Web (Sin descuento / Regular)
          </button>

          {/* Opción 2: Precio Final Web (Con Promociones y Descuentos) */}
          <button
            onClick={() => handleModeChange('final')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '9px',
              border: comparisonMode === 'final' ? '1px solid #ec4899' : '1px solid rgba(255, 255, 255, 0.1)',
              background: comparisonMode === 'final' ? 'rgba(236, 72, 153, 0.18)' : 'rgba(255, 255, 255, 0.04)',
              color: comparisonMode === 'final' ? '#f472b6' : '#94a3b8',
              fontSize: '0.83rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              transition: 'all 0.2s ease',
              boxShadow: comparisonMode === 'final' ? '0 0 12px rgba(236, 72, 153, 0.25)' : 'none',
            }}
          >
            <Percent size={15} />
            % Precio Final Web (Con promociones y descuentos)
          </button>
        </div>
      </div>

      {/* File Upload & Live Progress Box */}
      <div
        style={{
          border: '2px dashed rgba(192, 132, 252, 0.4)',
          borderRadius: '16px',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          background: 'rgba(15, 23, 42, 0.4)',
          marginBottom: '1.5rem',
          position: 'relative',
        }}
      >
        {loading ? (
          <div style={{ maxWidth: '650px', margin: '0 auto', textAlign: 'center' }}>
            <Loader2 size={36} color="#c084fc" className="animate-spin" style={{ margin: '0 auto 0.75rem auto' }} />
            
            <h3 style={{ color: '#ffffff', fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.35rem 0' }}>
              Auditando Precios ({comparisonMode === 'base' ? 'Precio Base Regular' : 'Precio Final Web'})...
            </h3>

            {progress ? (
              <div>
                <p style={{ color: '#38bdf8', fontSize: '0.88rem', fontWeight: 600, margin: '0 0 0.75rem 0' }}>
                  Lote {progress.currentBatch} de {progress.totalBatches} • {progress.current.toLocaleString()} / {progress.total.toLocaleString()} SKUs auditados ({progress.percentage}%)
                </p>

                {/* Animated Progress Bar */}
                <div style={{ width: '100%', height: '10px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '10px', overflow: 'hidden', marginBottom: '1rem', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${progress.percentage}%`,
                      background: 'linear-gradient(90deg, #a855f7, #38bdf8)',
                      borderRadius: '10px',
                      transition: 'width 0.3s ease',
                      boxShadow: '0 0 12px rgba(56, 189, 248, 0.6)',
                    }}
                  />
                </div>

                {/* Live Incremental Counters */}
                {auditData?.stats && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '1.25rem', fontSize: '0.8rem', color: '#94a3b8', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <span>🟢 Coinciden: <strong style={{ color: '#34d399' }}>{auditData.stats.matchCount.toLocaleString()}</strong></span>
                    <span>🔴 Discrepancias: <strong style={{ color: '#f87171' }}>{auditData.stats.mismatchCount.toLocaleString()}</strong></span>
                    <span>⚪ No encontrados: <strong style={{ color: '#cbd5e1' }}>{auditData.stats.notFoundCount.toLocaleString()}</strong></span>
                  </div>
                )}

                <button
                  onClick={handleCancelAudit}
                  style={{
                    padding: '0.4rem 1rem',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar Auditoría
                </button>
              </div>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
                Leyendo estructura del archivo Excel y normalizando columnas...
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
            <Upload size={42} color="#c084fc" style={{ opacity: 0.9 }} />
            <div>
              <p style={{ color: '#ffffff', fontWeight: 700, fontSize: '1.05rem', margin: '0 0 0.25rem 0' }}>
                Selecciona tu archivo Excel (.xlsx / .xls / .csv)
              </p>
              <p style={{ fontSize: '0.84rem', color: '#94a3b8', margin: 0 }}>
                Columnas requeridas: <strong style={{ color: '#e2e8f0' }}>SKU ID</strong> | <strong style={{ color: '#e2e8f0' }}>Precio Xstore Facturacion</strong>
              </p>
            </div>

            <label
              style={{
                cursor: 'pointer',
                padding: '0.65rem 1.75rem',
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                borderRadius: '10px',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.9rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.55rem',
                boxShadow: '0 4px 15px rgba(168, 85, 247, 0.35)',
                marginTop: '0.3rem',
                transition: 'all 0.2s ease',
              }}
            >
              <FileText size={18} />
              {fileName ? fileName : 'Cargar Archivo Excel Xstore'}
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          </div>
        )}
      </div>

      {/* Comparison Results & Dashboard */}
      {auditData && auditData.stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* KPI Cards Header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '1rem', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Total Auditados</span>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ffffff', marginTop: '0.2rem' }}>
                {auditData.stats.totalAudited.toLocaleString()}
              </div>
            </div>

            <div style={{ background: 'rgba(52, 211, 153, 0.08)', padding: '1rem', borderRadius: '14px', border: '1px solid rgba(52, 211, 153, 0.2)' }}>
              <span style={{ fontSize: '0.74rem', color: '#34d399', textTransform: 'uppercase', fontWeight: 600 }}>🟢 Coinciden (Iguales)</span>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#34d399', marginTop: '0.2rem' }}>
                {auditData.stats.matchCount.toLocaleString()}
              </div>
            </div>

            <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '1rem', borderRadius: '14px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <span style={{ fontSize: '0.74rem', color: '#f87171', textTransform: 'uppercase', fontWeight: 600 }}>🔴 Con Discrepancia</span>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f87171', marginTop: '0.2rem' }}>
                {auditData.stats.mismatchCount.toLocaleString()}
              </div>
            </div>

            <div style={{ background: 'rgba(148, 163, 184, 0.08)', padding: '1rem', borderRadius: '14px', border: '1px solid rgba(148, 163, 184, 0.2)' }}>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>⚪ No Encontrados</span>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#94a3b8', marginTop: '0.2rem' }}>
                {auditData.stats.notFoundCount.toLocaleString()}
              </div>
            </div>

            <div style={{ background: 'rgba(168, 85, 247, 0.08)', padding: '1rem', borderRadius: '14px', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
              <span style={{ fontSize: '0.74rem', color: '#c084fc', textTransform: 'uppercase', fontWeight: 600 }}>% Coincidencia</span>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#c084fc', marginTop: '0.2rem' }}>
                {auditData.stats.matchPercentage}%
              </div>
            </div>
          </div>

          {/* Filter Bar & Search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem', background: 'rgba(15, 23, 42, 0.5)', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            
            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => { setFilter('all'); setCurrentPage(1); }}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: filter === 'all' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                  color: filter === 'all' ? '#ffffff' : '#94a3b8',
                }}
              >
                Todos ({auditData.stats.totalAudited.toLocaleString()})
              </button>

              <button
                onClick={() => { setFilter('mismatch'); setCurrentPage(1); }}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: filter === 'mismatch' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                  color: filter === 'mismatch' ? '#f87171' : '#94a3b8',
                }}
              >
                ⚠️ Solo Discrepancias ({auditData.stats.mismatchCount.toLocaleString()})
              </button>

              <button
                onClick={() => { setFilter('match'); setCurrentPage(1); }}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: filter === 'match' ? 'rgba(52, 211, 153, 0.2)' : 'transparent',
                  color: filter === 'match' ? '#34d399' : '#94a3b8',
                }}
              >
                🟢 Coinciden ({auditData.stats.matchCount.toLocaleString()})
              </button>

              <button
                onClick={() => { setFilter('not_found'); setCurrentPage(1); }}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: filter === 'not_found' ? 'rgba(148, 163, 184, 0.2)' : 'transparent',
                  color: filter === 'not_found' ? '#e2e8f0' : '#94a3b8',
                }}
              >
                ⚪ No Encontrados ({auditData.stats.notFoundCount.toLocaleString()})
              </button>
            </div>

            {/* Search Bar */}
            <div style={{ position: 'relative', width: '260px' }}>
              <Search size={15} color="#64748b" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Buscar SKU ID o nombre..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.75rem 0.4rem 2.2rem',
                  background: '#1e293b',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.83rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Comparison Table */}
          <div style={{ borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden', background: '#04070d' }}>
            <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(15, 23, 42, 0.95)', color: '#94a3b8', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ padding: '0.85rem 1.25rem' }}>SKU ID</th>
                    <th style={{ padding: '0.85rem 1.25rem' }}>Descripción Producto</th>
                    <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Precio Xstore Facturación</th>
                    <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right', color: comparisonMode === 'base' ? '#38bdf8' : '#f472b6' }}>
                      {comparisonMode === 'base' ? 'Precio Base Web (Regular)' : 'Precio Final Web (Promo)'}
                    </th>
                    <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Diferencia (C$)</th>
                    <th style={{ padding: '0.85rem 1.25rem', textAlign: 'center' }}>Estado Comparación</th>
                  </tr>
                </thead>
                <tbody>
                  {currentPaginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                        No hay registros que coincidan con el filtro o la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    currentPaginatedRows.map((r, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          background: r.status === 'MISMATCH_HIGHER'
                            ? 'rgba(239, 68, 68, 0.05)'
                            : r.status === 'MISMATCH_LOWER'
                            ? 'rgba(245, 158, 11, 0.05)'
                            : 'transparent',
                        }}
                      >
                        {/* SKU ID */}
                        <td style={{ padding: '0.8rem 1.25rem' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              color: '#ffffff',
                              background: 'rgba(56, 189, 248, 0.12)',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '8px',
                              border: '1px solid rgba(56, 189, 248, 0.25)',
                              fontSize: '0.86rem',
                            }}
                          >
                            {r.skuId}
                          </span>
                        </td>

                        {/* Description */}
                        <td style={{ padding: '0.8rem 1.25rem', color: '#e2e8f0' }}>
                          {r.description}
                        </td>

                        {/* Xstore Price */}
                        <td style={{ padding: '0.8rem 1.25rem', textAlign: 'right', fontWeight: 700, color: '#ffffff' }}>
                          C$ {r.xstorePrice.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Target Web Price */}
                        <td style={{ padding: '0.8rem 1.25rem', textAlign: 'right', fontWeight: 800, color: r.targetWebPrice !== null ? (comparisonMode === 'base' ? '#38bdf8' : '#f472b6') : '#94a3b8' }}>
                          {r.targetWebPrice !== null
                            ? `C$ ${r.targetWebPrice.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : 'No Encontrado'}
                          
                          {/* Contextual Subtitle showing the other price and promo */}
                          {comparisonMode === 'base' && r.webFinalPrice !== null && r.webFinalPrice !== r.targetWebPrice && (
                            <span
                              style={{
                                display: 'block',
                                fontSize: '0.7rem',
                                color: '#f472b6',
                                fontWeight: 600,
                                marginTop: '0.2rem',
                              }}
                              title={`Precio en web con promo activa: C$ ${r.webFinalPrice}`}
                            >
                              🏷️ Promo web activa: C$ {r.webFinalPrice.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {r.discountPct ? `(-${r.discountPct}%)` : ''}
                            </span>
                          )}

                          {comparisonMode === 'final' && r.basePrice !== null && (
                            <span
                              style={{
                                display: 'block',
                                fontSize: '0.7rem',
                                color: '#94a3b8',
                                fontWeight: 500,
                                marginTop: '0.2rem',
                              }}
                            >
                              Base regular: C$ {r.basePrice.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {r.promoName ? `• ${r.promoName}` : ''}
                            </span>
                          )}
                        </td>

                        {/* Difference Amount & % */}
                        <td style={{ padding: '0.8rem 1.25rem', textAlign: 'right', fontWeight: 700, color: r.badgeColor }}>
                          {r.diffAmount !== null ? (
                            <>
                              {r.diffAmount > 0 ? `+C$ ${r.diffAmount.toFixed(2)}` : r.diffAmount < 0 ? `-C$ ${Math.abs(r.diffAmount).toFixed(2)}` : 'C$ 0.00'}
                              <span style={{ fontSize: '0.72rem', display: 'block', opacity: 0.8 }}>
                                {r.diffPercent > 0 ? `(+${r.diffPercent.toFixed(1)}%)` : r.diffPercent < 0 ? `(${r.diffPercent.toFixed(1)}%)` : '0%'}
                              </span>
                            </>
                          ) : (
                            '-'
                          )}
                        </td>

                        {/* Status Badge */}
                        <td style={{ padding: '0.8rem 1.25rem', textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.65rem',
                              borderRadius: '20px',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              background: `${r.badgeColor}20`,
                              color: r.badgeColor,
                              border: `1px solid ${r.badgeColor}40`,
                            }}
                          >
                            {r.statusText}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1.25rem',
                background: 'rgba(15, 23, 42, 0.95)',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                flexWrap: 'wrap',
                gap: '0.75rem',
                fontSize: '0.84rem',
              }}
            >
              {/* Counter details */}
              <div style={{ color: '#94a3b8' }}>
                Mostrando{' '}
                <strong style={{ color: '#ffffff' }}>
                  {totalFiltered === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}
                </strong>{' '}
                -{' '}
                <strong style={{ color: '#ffffff' }}>
                  {Math.min(safeCurrentPage * pageSize, totalFiltered).toLocaleString()}
                </strong>{' '}
                de <strong style={{ color: '#c084fc' }}>{totalFiltered.toLocaleString()}</strong> registros filtrados
              </div>

              {/* Page size selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8' }}>
                <span>Filas por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{
                    background: '#1e293b',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={500}>500</option>
                </select>
              </div>

              {/* Navigation buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <button
                  onClick={() => goToPage(1)}
                  disabled={safeCurrentPage <= 1}
                  style={{
                    padding: '0.35rem 0.55rem',
                    background: safeCurrentPage <= 1 ? 'transparent' : 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: safeCurrentPage <= 1 ? '#475569' : '#ffffff',
                    cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
                  }}
                  title="Primera página"
                >
                  <ChevronsLeft size={16} />
                </button>

                <button
                  onClick={() => goToPage(safeCurrentPage - 1)}
                  disabled={safeCurrentPage <= 1}
                  style={{
                    padding: '0.35rem 0.55rem',
                    background: safeCurrentPage <= 1 ? 'transparent' : 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: safeCurrentPage <= 1 ? '#475569' : '#ffffff',
                    cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
                  }}
                  title="Página anterior"
                >
                  <ChevronLeft size={16} />
                </button>

                <span style={{ padding: '0 0.5rem', color: '#e2e8f0', fontWeight: 600 }}>
                  Página {safeCurrentPage} de {totalPages}
                </span>

                <button
                  onClick={() => goToPage(safeCurrentPage + 1)}
                  disabled={safeCurrentPage >= totalPages}
                  style={{
                    padding: '0.35rem 0.55rem',
                    background: safeCurrentPage >= totalPages ? 'transparent' : 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: safeCurrentPage >= totalPages ? '#475569' : '#ffffff',
                    cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
                  }}
                  title="Página siguiente"
                >
                  <ChevronRight size={16} />
                </button>

                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={safeCurrentPage >= totalPages}
                  style={{
                    padding: '0.35rem 0.55rem',
                    background: safeCurrentPage >= totalPages ? 'transparent' : 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: safeCurrentPage >= totalPages ? '#475569' : '#ffffff',
                    cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
                  }}
                  title="Última página"
                >
                  <ChevronsRight size={16} />
                </button>

                {/* Direct Page Jump Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const num = parseInt(pageJumpInput, 10);
                    if (!isNaN(num)) {
                      goToPage(num);
                      setPageJumpInput('');
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem' }}
                >
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    placeholder="Ir a #"
                    value={pageJumpInput}
                    onChange={(e) => setPageJumpInput(e.target.value)}
                    style={{
                      width: '58px',
                      padding: '0.25rem 0.4rem',
                      background: '#1e293b',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '0.8rem',
                      outline: 'none',
                      textAlign: 'center',
                    }}
                  />
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
