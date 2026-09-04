'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Warehouse,
  Loader2,
  Trash2,
  Layers,
  ArrowUpDown,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import * as XLSX from 'xlsx';

export default function BulkInventoryLookupModal({ isOpen, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [inputMode, setInputMode] = useState('excel'); // 'excel' | 'paste'
  const [pasteText, setPasteText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedSkuIds, setParsedSkuIds] = useState([]);
  const [liveVtex, setLiveVtex] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [filterResult, setFilterResult] = useState('all'); // 'all' | 'with_stock' | 'out_of_stock'
  const [searchFilter, setSearchFilter] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Bloquear scroll de la página de fondo cuando el modal esté abierto
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Manejar teclado ESC para cerrar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  // 1. Procesar archivo Excel / CSV
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!matrix || matrix.length === 0) {
          alert('El archivo Excel está vacío.');
          return;
        }

        // Detectar fila de encabezados
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(matrix.length, 25); i++) {
          const rowStr = matrix[i].map((c) => String(c).trim().toLowerCase()).join(' ');
          if (
            rowStr.includes('sku') ||
            rowStr.includes('codigo') ||
            rowStr.includes('código') ||
            rowStr.includes('item') ||
            rowStr.includes('id')
          ) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) headerRowIdx = 0;

        const headers = matrix[headerRowIdx].map((c) => String(c).trim().toLowerCase());
        let skuColIdx = headers.findIndex(
          (h) => h === 'sku' || h === 'sku_id' || h === 'id' || h.includes('sku') || h.includes('codigo') || h.includes('código')
        );

        if (skuColIdx === -1) skuColIdx = 0;

        const dataRows = matrix.slice(headerRowIdx + 1);
        const extractedIds = [];

        dataRows.forEach((r) => {
          const rawVal = r[skuColIdx];
          if (rawVal != null && rawVal !== '') {
            const cleanStr = String(rawVal).replace(/\.0$/, '').trim();
            const num = parseInt(cleanStr, 10);
            if (!isNaN(num) && num > 0) {
              extractedIds.push(num);
            }
          }
        });

        const uniqueIds = Array.from(new Set(extractedIds));
        setParsedSkuIds(uniqueIds);
      } catch (err) {
        console.error('Error leyendo archivo Excel:', err);
        alert('Error al leer el archivo: ' + err.message);
      }
    };

    reader.readAsBinaryString(file);
  };

  // 2. Procesar texto pegado manualmente
  const handlePasteChange = (e) => {
    const text = e.target.value;
    setPasteText(text);

    // Extraer todos los números de 6 a 12 dígitos
    const matches = text.match(/\b\d{5,12}\b/g) || [];
    const uniqueIds = Array.from(new Set(matches.map((n) => parseInt(n, 10))));
    setParsedSkuIds(uniqueIds);
  };

  // 3. Ejecutar consulta al backend
  const handleExecuteLookup = async () => {
    if (parsedSkuIds.length === 0) {
      alert('Por favor agrega al menos un SKU válido para consultar.');
      return;
    }

    setLoading(true);
    setResults(null);

    try {
      const res = await fetch('/api/skus/inventory/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuIds: parsedSkuIds,
          liveVtex,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResults(data);
      } else {
        alert(`Error al consultar inventarios: ${data.error}`);
      }
    } catch (err) {
      console.error('Error en consulta de inventario:', err);
      alert(`Error de red al consultar inventarios: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 4. Descargar resultados en Excel (.xlsx)
  const handleDownloadExcel = () => {
    if (!results || !Array.isArray(results.skus) || results.skus.length === 0) {
      alert('No hay datos disponibles para exportar.');
      return;
    }

    const exportRows = results.skus.map((s) => ({
      'SKU ID': s.id,
      'Descripción / Producto': s.name || 'N/A',
      'Referencia (Ref ID)': s.refId || 'N/A',
      'Stock Mega (Disponible)': s.stockMega,
      'Stock Mega (Reservado)': s.wh1Reserved,
      'Stock Mega (Físico)': s.wh1Total,
      'Stock Cedis (Disponible)': s.stockCedis,
      'Stock Cedis (Reservado)': s.wh2Reserved,
      'Stock Cedis (Físico)': s.wh2Total,
      'Stock Total Disponible': s.totalStock,
      'Stock Total Reservado': s.totalReserved,
      'Stock Total Físico': s.totalQuantity,
      'Estado Stock': s.status,
      'Estado SKU': s.isActive ? 'Activo' : 'Inactivo',
      'Última Actualización': s.inventoryUpdatedAt
        ? new Date(s.inventoryUpdatedAt).toLocaleString('es-NI')
        : 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario Tiendas');

    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 45 },
      { wch: 20 },
      { wch: 22 },
      { wch: 22 },
      { wch: 20 },
      { wch: 22 },
      { wch: 22 },
      { wch: 20 },
      { wch: 22 },
      { wch: 20 },
      { wch: 18 },
      { wch: 14 },
      { wch: 12 },
      { wch: 24 },
    ];

    const todayStr = new Date().toISOString().slice(0, 10);
    const downloadName = `Inventario_Por_Tienda_SINSA_${todayStr}.xlsx`;
    XLSX.writeFile(workbook, downloadName);
  };

  // Filtrar lista de resultados
  const filteredSkus = (results?.skus || []).filter((s) => {
    if (filterResult === 'with_stock' && s.totalStock <= 0) return false;
    if (filterResult === 'out_of_stock' && s.totalStock > 0) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      const idStr = String(s.id);
      const nameStr = (s.name || '').toLowerCase();
      const refStr = (s.refId || '').toLowerCase();
      return idStr.includes(q) || nameStr.includes(q) || refStr.includes(q);
    }
    return true;
  });

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(5, 9, 17, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isFullScreen ? 0 : '1.5rem',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(13, 20, 36, 0.98), rgba(20, 30, 50, 0.99))',
          border: isFullScreen ? 'none' : '1px solid rgba(56, 189, 248, 0.35)',
          boxShadow: isFullScreen ? 'none' : '0 25px 60px -15px rgba(0, 0, 0, 0.95), 0 0 45px rgba(56, 189, 248, 0.2)',
          borderRadius: isFullScreen ? 0 : '18px',
          width: isFullScreen ? '100vw' : '96vw',
          maxWidth: isFullScreen ? '100vw' : '1440px',
          height: isFullScreen ? '100vh' : '94vh',
          maxHeight: isFullScreen ? '100vh' : '94vh',
          display: 'flex',
          flexDirection: 'column',
          color: '#ffffff',
          boxSizing: 'border-box',
          overflow: 'hidden',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.7)',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ffffff' }}>
              <FileSpreadsheet size={22} color="#38bdf8" />
              Consulta Masiva de Inventario por Lista de SKUs
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
              Carga una lista de SKUs desde un archivo Excel o cópialos directamente para obtener el inventario desglosado por tienda y exportar el reporte.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              onClick={() => setIsFullScreen((prev) => !prev)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.45rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              title={isFullScreen ? 'Restaurar tamaño normal' : 'Maximizar a pantalla completa'}
            >
              {isFullScreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.45rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              title="Cerrar modal (Esc)"
            >
              <X size={21} />
            </button>
          </div>
        </div>

        {/* Modal Body (Scrollable) */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Seccion de Carga de SKUs */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1.1rem' }}>
            
            {/* Tabs Selector de Entrada */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.6rem' }}>
              <button
                onClick={() => setInputMode('excel')}
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: inputMode === 'excel' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                  color: inputMode === 'excel' ? '#38bdf8' : 'var(--text-muted)',
                  borderBottom: inputMode === 'excel' ? '2px solid #38bdf8' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <Upload size={15} /> 1. Subir Archivo Excel / CSV
              </button>

              <button
                onClick={() => setInputMode('paste')}
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: inputMode === 'paste' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                  color: inputMode === 'paste' ? '#38bdf8' : 'var(--text-muted)',
                  borderBottom: inputMode === 'paste' ? '2px solid #38bdf8' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <FileText size={15} /> 2. O Pegar Lista de Texto
              </button>
            </div>

            {/* Modo Excel */}
            {inputMode === 'excel' ? (
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx, .xls, .csv"
                  style={{ display: 'none' }}
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed rgba(56, 189, 248, 0.4)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: 'rgba(56, 189, 248, 0.04)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Upload size={32} color="#38bdf8" style={{ margin: '0 auto 0.5rem auto' }} />
                  <p style={{ margin: '0 0 0.25rem 0', fontWeight: 600, fontSize: '0.92rem' }}>
                    {fileName ? `📄 ${fileName}` : 'Haz clic aquí para seleccionar tu archivo Excel (.xlsx, .xls, .csv)'}
                  </p>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Detecta automáticamente la columna con encabezado "SKU", "ID", "Código" o la primera columna con números.
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <textarea
                  className="glass-input"
                  rows={4}
                  style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', padding: '0.75rem', boxSizing: 'border-box' }}
                  placeholder="Pega aquí los SKUs separados por salto de línea, coma o espacio (ejemplo: 100393972, 100766759, 148127850)..."
                  value={pasteText}
                  onChange={handlePasteChange}
                />
              </div>
            )}

            {/* Barra de Control de Consulta */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: parsedSkuIds.length > 0 ? '#34d399' : 'var(--text-muted)' }}>
                  {parsedSkuIds.length > 0 ? `✅ ${parsedSkuIds.length.toLocaleString()} SKUs válidos detectados` : 'Ningún SKU seleccionado aún'}
                </span>

                {parsedSkuIds.length > 0 && (
                  <button
                    onClick={() => {
                      setParsedSkuIds([]);
                      setFileName('');
                      setPasteText('');
                      setResults(null);
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                  >
                    <Trash2 size={13} /> Limpiar
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-dim)', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={liveVtex}
                    onChange={(e) => setLiveVtex(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Consultar VTEX Logistics en vivo</span>
                </label>

                <button
                  onClick={handleExecuteLookup}
                  disabled={loading || parsedSkuIds.length === 0}
                  className="btn-primary"
                  style={{
                    padding: '0.55rem 1.25rem',
                    fontSize: '0.86rem',
                    opacity: loading || parsedSkuIds.length === 0 ? 0.6 : 1,
                    cursor: loading || parsedSkuIds.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  {loading ? 'Consultando...' : '🔍 Consultar Inventario por Tienda'}
                </button>
              </div>
            </div>

          </div>

          {/* Resultados */}
          {loading && (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={28} className="animate-spin" color="var(--accent-primary)" style={{ margin: '0 auto 0.75rem auto' }} />
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', color: '#ffffff' }}>
                Consultando inventarios desglosados en Mega y Cedis...
              </p>
              <span style={{ fontSize: '0.8rem' }}>Procesando {parsedSkuIds.length} SKUs...</span>
            </div>
          )}

          {results && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Tarjetas de Resumen */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '0.85rem 1rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>TOTAL CONSULTADOS</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    {results.totalRequested.toLocaleString()}
                  </div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>{results.foundCount} encontrados</span>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '0.85rem 1rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>CON STOCK DISPONIBLE</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                    {results.summary.withStockCount.toLocaleString()}
                  </div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>Listos para venta</span>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '0.85rem 1rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>SIN STOCK / AGOTADOS</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f87171', fontFamily: 'var(--font-mono)' }}>
                    {results.summary.outOfStockCount.toLocaleString()}
                  </div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>Requiere abastecer</span>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '0.85rem 1rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>UNIDADES DISPONIBLES</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                    {results.summary.totalAvailable.toLocaleString()}
                  </div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                    Mega: {results.summary.stockMega.toLocaleString()} | Cedis: {results.summary.stockCedis.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Barra de Filtro y Botón Descarga Excel */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', minWidth: '200px' }}>
                    <Search size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      className="glass-input"
                      style={{ paddingLeft: '2rem', fontSize: '0.8rem', padding: '0.35rem 0.5rem 0.35rem 2rem' }}
                      placeholder="Filtrar por SKU o nombre..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                    />
                  </div>

                  <select
                    className="glass-input"
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                    value={filterResult}
                    onChange={(e) => setFilterResult(e.target.value)}
                  >
                    <option value="all">Todos ({results.skus.length})</option>
                    <option value="with_stock">Solo con Stock ({results.summary.withStockCount})</option>
                    <option value="out_of_stock">Solo Agotados ({results.summary.outOfStockCount})</option>
                  </select>
                </div>

                <button
                  onClick={handleDownloadExcel}
                  style={{
                    padding: '0.55rem 1.25rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(52, 211, 153, 0.4)',
                    background: 'rgba(52, 211, 153, 0.16)',
                    color: '#34d399',
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 15px rgba(52, 211, 153, 0.2)',
                    transition: 'all 0.2s ease',
                  }}
                  title="Descargar archivo Excel con los inventarios por tienda"
                >
                  <Download size={16} />
                  📥 Descargar Reporte Excel (.xlsx)
                </button>
              </div>

              {/* Tabla de Resultados */}
              <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-subtle)', maxHeight: '350px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.6rem 0.75rem' }}>SKU ID</th>
                      <th style={{ padding: '0.6rem 0.75rem' }}>Descripción del Producto</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>Stock Mega (24)</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>Stock Cedis (1041)</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#34d399' }}>Stock Total</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-dim)' }}>Reservado</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSkus.map((sku) => {
                      const hasStock = sku.totalStock > 0;
                      return (
                        <tr
                          key={sku.id}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                            background: hasStock ? 'transparent' : 'rgba(248, 113, 113, 0.03)',
                          }}
                          className="hover-row"
                        >
                          <td style={{ padding: '0.55rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-primary)' }}>
                            {sku.id}
                          </td>
                          <td style={{ padding: '0.55rem 0.75rem', color: '#ffffff', maxWidth: '320px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {sku.name}
                          </td>
                          <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: sku.stockMega > 0 ? '#38bdf8' : 'var(--text-dim)', fontWeight: sku.stockMega > 0 ? 600 : 400 }}>
                            {sku.stockMega.toLocaleString()}
                          </td>
                          <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: sku.stockCedis > 0 ? '#a78bfa' : 'var(--text-dim)', fontWeight: sku.stockCedis > 0 ? 600 : 400 }}>
                            {sku.stockCedis.toLocaleString()}
                          </td>
                          <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 800, color: hasStock ? '#34d399' : '#f87171', fontSize: '0.86rem' }}>
                            {sku.totalStock.toLocaleString()}
                          </td>
                          <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: sku.totalReserved > 0 ? '#fbbf24' : 'var(--text-dim)' }}>
                            {sku.totalReserved.toLocaleString()}
                          </td>
                          <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center' }}>
                            <span
                              style={{
                                padding: '0.15rem 0.5rem',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: hasStock ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                                color: hasStock ? '#34d399' : '#f87171',
                                border: `1px solid ${hasStock ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.3)'}`,
                              }}
                            >
                              {sku.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.8)',
          }}
        >
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Tiendas activas: <strong>Mega (Bodega 24)</strong> y <strong>Cedis (Bodega 1041)</strong>.
          </span>

          <button
            onClick={onClose}
            className="btn-secondary"
            style={{ fontSize: '0.84rem', padding: '0.45rem 1.1rem' }}
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
