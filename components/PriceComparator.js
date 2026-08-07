'use client';

import { useState } from 'react';
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
} from 'lucide-react';

export default function PriceComparator() {
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [auditData, setAuditData] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'mismatch' | 'match' | 'not_found'
  const [searchTerm, setSearchTerm] = useState('');

  // Helper para procesar la hoja del Excel de Xstore (Columna A: SKU ID, Columna B: Precio Xstore Facturacion)
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

  // Cargar archivo Excel
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setAuditData(null);

    try {
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
        alert('No se encontraron SKUs válidos en el archivo Excel. Asegúrate de incluir las columnas "SKU ID" y "Precio Xstore Facturacion".');
        setLoading(false);
        return;
      }

      // Enviar a la API /api/prices/audit
      const res = await fetch('/api/prices/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: bestResult.rows }),
      });

      const auditRes = await res.json();
      if (auditRes.success) {
        setAuditData(auditRes);
      } else {
        alert('Error en la comparación: ' + (auditRes.error || 'Fallo desconocido'));
      }
    } catch (err) {
      console.error('Error procesando comparación de precios:', err);
      alert('Error leyendo el archivo Excel: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Exportar reporte de comparación a Excel
  const handleExportExcel = () => {
    if (!auditData || !Array.isArray(auditData.results)) return;

    const exportRows = auditData.results.map((r) => ({
      'SKU ID': r.skuId,
      'Descripción / Producto': r.description,
      'Precio Xstore Facturación (C$)': r.xstorePrice,
      'Precio Final Web (C$)': r.webFinalPrice !== null ? r.webFinalPrice : 'No Encontrado',
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
      { wch: 22 },
      { wch: 18 },
      { wch: 18 },
      { wch: 25 },
    ];

    XLSX.writeFile(workbook, `Reporte_Comparativa_Xstore_vs_Web_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Filtrado de filas según pestaña y buscador
  const filteredResults = auditData?.results
    ? auditData.results.filter((r) => {
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

        const matchesSearch = searchTerm.trim()
          ? String(r.skuId).includes(searchTerm.trim()) ||
            (r.description && r.description.toLowerCase().includes(searchTerm.trim().toLowerCase()))
          : true;

        return matchesFilter && matchesSearch;
      })
    : [];

  return (
    <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
      
      {/* Module Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0 0 0.25rem 0' }}>
            <Scale size={24} color="#c084fc" />
            Comparador de Precios: Xstore Facturación vs. Precio Final Web
          </h2>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: 0 }}>
            Sube tu archivo Excel con las columnas <code style={{ color: '#c084fc' }}>SKU ID</code> y <code style={{ color: '#c084fc' }}>Precio Xstore Facturacion</code> para auditar coincidencias en vivo
          </p>
        </div>

        {auditData && (
          <button
            onClick={handleExportExcel}
            style={{
              padding: '0.6rem 1.25rem',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              borderRadius: '10px',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
            }}
          >
            <Download size={16} />
            Exportar Resultados a Excel (.xlsx)
          </button>
        )}
      </div>

      {/* File Upload Box */}
      <div
        style={{
          border: '2px dashed rgba(192, 132, 252, 0.4)',
          borderRadius: '16px',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          background: 'rgba(15, 23, 42, 0.4)',
          marginBottom: '1.5rem',
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <Loader2 size={36} color="#c084fc" className="animate-spin" style={{ margin: '0 auto 0.75rem auto' }} />
            <h3 style={{ color: '#ffffff', fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.2rem 0' }}>
              Comparando Precios contra la Base de Datos de la Web...
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.83rem', margin: 0 }}>
              Analizando coincidencia contra la columna Precio Base (Venta)...
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <Upload size={40} color="#c084fc" style={{ opacity: 0.9 }} />
            <div>
              <p style={{ color: '#ffffff', fontWeight: 700, fontSize: '1rem', margin: '0 0 0.2rem 0' }}>
                Selecciona tu archivo Excel (.xlsx / .xls / .csv)
              </p>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
                Estructura de columnas: <strong>SKU ID</strong> | <strong>Precio Xstore Facturacion</strong>
              </p>
            </div>

            <label
              style={{
                cursor: 'pointer',
                padding: '0.65rem 1.5rem',
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                borderRadius: '10px',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.88rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 15px rgba(168, 85, 247, 0.35)',
                marginTop: '0.4rem',
              }}
            >
              <FileText size={17} />
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
                onClick={() => setFilter('all')}
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
                Todos ({auditData.stats.totalAudited})
              </button>

              <button
                onClick={() => setFilter('mismatch')}
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
                ⚠️ Solo Discrepancias ({auditData.stats.mismatchCount})
              </button>

              <button
                onClick={() => setFilter('match')}
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
                🟢 Coinciden ({auditData.stats.matchCount})
              </button>

              <button
                onClick={() => setFilter('not_found')}
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
                ⚪ No Encontrados ({auditData.stats.notFoundCount})
              </button>
            </div>

            {/* Search Bar */}
            <div style={{ position: 'relative', width: '250px' }}>
              <Search size={15} color="#64748b" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Buscar SKU ID o nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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
            <div style={{ overflowX: 'auto', maxHeight: '450px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(15, 23, 42, 0.95)', color: '#94a3b8', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ padding: '0.85rem 1.25rem' }}>SKU ID</th>
                    <th style={{ padding: '0.85rem 1.25rem' }}>Descripción Producto</th>
                    <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Precio Xstore Facturación</th>
                    <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right', color: '#38bdf8' }}>Precio Final Web</th>
                    <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Diferencia (C$)</th>
                    <th style={{ padding: '0.85rem 1.25rem', textAlign: 'center' }}>Estado Comparación</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                        No hay registros que coincidan con el filtro o la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredResults.map((r, i) => (
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

                        {/* Web Final Price */}
                        <td style={{ padding: '0.8rem 1.25rem', textAlign: 'right', fontWeight: 800, color: r.webFinalPrice !== null ? '#38bdf8' : '#94a3b8' }}>
                          {r.webFinalPrice !== null
                            ? `C$ ${r.webFinalPrice.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : 'No Encontrado'}
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
          </div>
        </div>
      )}
    </div>
  );
}
