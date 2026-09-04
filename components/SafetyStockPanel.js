'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Search,
  Edit3,
  Trash2,
  Check,
  Save,
  Layers,
  TrendingUp,
  Download,
  Tag,
  Folder,
  Box,
} from 'lucide-react';
import * as XLSX from 'xlsx';

export default function SafetyStockPanel({ onSafetyStockUpdated }) {
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'upload' | 'single'
  const [items, setItems] = useState([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'with_safety' | 'without_safety'
  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Estados de Edición Inline
  const [editingRowId, setEditingRowId] = useState(null);
  const [editStockValue, setEditStockValue] = useState('');
  const [savingRowId, setSavingRowId] = useState(null);
  const [savedRowId, setSavedRowId] = useState(null);

  // Carga de Excel / CSV
  const [parsedRows, setParsedRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState(null);

  // Paginación y conteo exacto de Supabase
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [globalStats, setGlobalStats] = useState({ totalCatalog: 84572, configuredCount: 82674 });

  // Modal confirmación eliminación / reset
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Cargar lista existente desde public.vtex_skus con conteo exacto y paginación
  const fetchSafetyStockItems = useCallback(async () => {
    setIsLoadingItems(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (filterStatus !== 'all') params.set('filter', filterStatus);
      params.set('page', String(currentPage));
      params.set('pageSize', String(pageSize));

      const res = await fetch(`/api/skus/safety-stock?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
        setTotalRecords(data.total || 0);
        setTotalPages(data.totalPages || 1);
        if (data.stats) {
          setGlobalStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Error cargando stock de seguridad:', err);
    } finally {
      setIsLoadingItems(false);
    }
  }, [searchTerm, filterStatus, currentPage, pageSize]);

  useEffect(() => {
    fetchSafetyStockItems();
  }, [fetchSafetyStockItems]);

  // Guardar edición rápida inline de Stock de Seguridad
  const handleSaveInline = async (item) => {
    const newStock = parseInt(editStockValue, 10);
    if (isNaN(newStock) || newStock < 0) return;

    setSavingRowId(item.sku_id);
    try {
      const res = await fetch('/api/skus/safety-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: item.sku_id,
          safetyStock: newStock,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Actualizar localmente
        setItems((prev) =>
          prev.map((r) =>
            r.sku_id === item.sku_id
              ? {
                  ...r,
                  safety_stock: newStock,
                  is_at_risk: newStock > 0 && r.total_stock <= newStock,
                  updated_at: new Date().toISOString(),
                }
              : r
          )
        );
        setEditingRowId(null);
        setSavedRowId(item.sku_id);
        setTimeout(() => setSavedRowId(null), 2500);

        if (onSafetyStockUpdated) onSafetyStockUpdated();
      }
    } catch (err) {
      console.error('Error al actualizar stock de seguridad:', err);
    } finally {
      setSavingRowId(null);
    }
  };

  // Restablecer a 0 el Stock de Seguridad de un SKU
  const handleDeleteItem = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/skus/safety-stock?skuId=${deleteTarget.sku_id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setDeleteTarget(null);
        fetchSafetyStockItems();
        if (onSafetyStockUpdated) onSafetyStockUpdated();
      }
    } catch (err) {
      console.error('Error eliminando registro:', err);
    }
  };

  // Helper para procesar una hoja concreta de Excel (Solo 2 columnas requeridas: SKU y STOCK)
  const parseSheetData = (worksheet) => {
    const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!matrix || matrix.length === 0) return { rows: [] };

    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(matrix.length, 30); i++) {
      const rowStr = matrix[i].map((c) => String(c).trim().toLowerCase()).join(' ');
      if (
        rowStr.includes('sku') ||
        rowStr.includes('codigo') ||
        rowStr.includes('código') ||
        rowStr.includes('item')
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
      (h) => h === 'sku' || h === 'sku_id' || h === 'id' || h.includes('sku') || h.includes('codigo') || h.includes('código')
    );
    if (skuIdx === -1) skuIdx = 0;

    let stockIdx = lowerHeaders.findIndex(
      (h) =>
        h.includes('stock') ||
        h.includes('seguridad') ||
        h.includes('safety') ||
        h.includes('threshold') ||
        h.includes('minimo') ||
        h.includes('mínimo') ||
        h.includes('resguardo')
    );
    // Si solo hay 2 columnas en el Excel, tomar la segunda columna como stock de seguridad
    if (stockIdx === -1) {
      stockIdx = lowerHeaders.length === 2 && skuIdx === 0 ? 1 : (skuIdx === 1 ? 0 : 1);
    }

    const dataRows = matrix.slice(headerRowIdx + 1);
    const rows = [];

    for (const r of dataRows) {
      const rawSku = r[skuIdx];
      if (rawSku == null || rawSku === '') continue;

      const cleanSkuStr = String(rawSku).replace(/\.0$/, '').trim();
      const skuNum = parseInt(cleanSkuStr, 10);
      if (isNaN(skuNum) || skuNum <= 0) continue;

      const rawStock = r[stockIdx];
      const safetyStock =
        typeof rawStock === 'number'
          ? Math.round(rawStock)
          : parseInt(String(rawStock).replace(/,/g, ''), 10) || 0;

      rows.push({
        skuId: skuNum,
        safetyStock: Math.max(0, safetyStock),
      });
    }

    return { rows };
  };

  // Cargar archivo Excel
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setMessage(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        setMessage({ type: 'error', text: 'El archivo Excel no contiene hojas de cálculo.' });
        return;
      }

      let bestSheetName = workbook.SheetNames[0];
      let bestResult = parseSheetData(workbook.Sheets[bestSheetName]);

      for (let i = 1; i < workbook.SheetNames.length; i++) {
        const sheetName = workbook.SheetNames[i];
        const res = parseSheetData(workbook.Sheets[sheetName]);
        if (res.rows.length > bestResult.rows.length) {
          bestSheetName = sheetName;
          bestResult = res;
        }
      }

      if (bestResult.rows.length === 0) {
        setMessage({ type: 'error', text: 'No se encontraron SKUs válidos en el archivo Excel.' });
        return;
      }

      setParsedRows(bestResult.rows);
      setMessage({
        type: 'success',
        text: `Se leyeron ${bestResult.rows.length.toLocaleString()} filas de la hoja "${bestSheetName}". Formato ligero de 2 columnas listo.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: `Error procesando el archivo: ${err.message}` });
    }
  };

  // Descargar plantilla Excel de 2 columnas
  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['SKU', 'STOCK_SEGURIDAD'],
      ['145519751', 2],
      ['163694140', 3],
      ['163643772', 5],
      ['163693964', 3],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'StockSeguridad');
    XLSX.writeFile(wb, 'plantilla_stock_seguridad_sinsa.xlsx');
  };

  // Exportar catálogo de stock de seguridad a Excel (.xlsx) respetando filtros
  const handleExportExcel = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setMessage(null);

    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (filterStatus !== 'all') params.set('filter', filterStatus);

      const res = await fetch(`/api/skus/safety-stock/export?${params.toString()}`);
      const json = await res.json();

      if (!json.success || !json.skus || json.skus.length === 0) {
        setMessage({
          type: 'error',
          text: 'No se encontraron registros para exportar con los filtros seleccionados.',
        });
        return;
      }

      // Preparar estructura de filas con cabeceras limpias y profesionales en español
      const exportRows = json.skus.map((item) => ({
        'SKU ID': item.id,
        'Producto (Nombre VTEX)': item.name,
        'Referencia': item.ref_id || '',
        'Marca': item.brand,
        'Categoría': item.category,
        'Stock Físico': item.total_stock,
        'Stock de Resguardo': item.safety_stock,
        'Estado / Riesgo': item.status,
        'Última Actualización': item.updated_at,
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock de Seguridad');

      // Anchos de columna óptimos
      worksheet['!cols'] = [
        { wch: 14 }, // SKU ID
        { wch: 48 }, // Producto (Nombre VTEX)
        { wch: 18 }, // Referencia
        { wch: 22 }, // Marca
        { wch: 25 }, // Categoría
        { wch: 14 }, // Stock Físico
        { wch: 20 }, // Stock Resguardo
        { wch: 24 }, // Estado / Riesgo
        { wch: 22 }, // Última Actualización
      ];

      const suffix =
        filterStatus === 'at_risk'
          ? '_EN_RIESGO'
          : filterStatus === 'with_safety'
          ? '_CON_RESGUARDO'
          : filterStatus === 'without_safety'
          ? '_SIN_RESGUARDO'
          : '_TODOS';

      const dateStr = new Date().toISOString().slice(0, 10);
      const outputFileName = `Stock_Seguridad_SINSA${suffix}_${dateStr}.xlsx`;

      XLSX.writeFile(workbook, outputFileName);

      setMessage({
        type: 'success',
        text: `✅ Reporte Excel descargado: ${exportRows.length.toLocaleString()} SKUs exportados exitosamente.`,
      });
    } catch (err) {
      console.error('Error exportando Excel:', err);
      setMessage({
        type: 'error',
        text: `Error al generar el archivo Excel: ${err.message}`,
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Guardar datos masivamente
  const handleSaveBulk = async () => {
    if (parsedRows.length === 0) return;
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/skus/safety-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedRows }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `🎉 ¡Éxito! ${data.message}` });
        setParsedRows([]);
        setFileName('');
        fetchSafetyStockItems();
        if (onSafetyStockUpdated) onSafetyStockUpdated();
      } else {
        setMessage({ type: 'error', text: `Error: ${data.error}` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Error de red: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      
      {/* Panel Header & Navigation Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }} className="mobile-stack">
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.25rem 0' }}>
            <ShieldAlert size={22} color="var(--accent-amber)" />
            Gestión de Stock de Seguridad & Resguardos VTEX
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Unificado directamente en el catálogo. Visualiza marca, categoría, inventario físico y umbrales de resguardo.
          </p>
        </div>

        {/* Action Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(15, 23, 42, 0.6)', padding: '0.25rem', borderRadius: '12px', border: '1px solid var(--border-subtle)', width: '100%', maxWidth: 'max-content' }} className="mobile-stack">
          <button
            onClick={() => setActiveTab('list')}
            style={{
              padding: '0.45rem 0.95rem',
              borderRadius: '9px',
              border: 'none',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'list' ? 'var(--gradient-btn)' : 'transparent',
              color: activeTab === 'list' ? '#ffffff' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease',
            }}
          >
            <Layers size={15} /> Registros ({totalRecords.toLocaleString()})
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            style={{
              padding: '0.45rem 0.95rem',
              borderRadius: '9px',
              border: 'none',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'upload' ? 'var(--gradient-btn)' : 'transparent',
              color: activeTab === 'upload' ? '#ffffff' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease',
            }}
          >
            <Upload size={15} /> Cargar Excel / CSV (2 Columnas)
          </button>
        </div>
      </div>

      {/* Global Alert Notification Message */}
      {message && (
        <div
          style={{
            background: message.type === 'success' ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.12)',
            border: `1px solid ${message.type === 'success' ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.3)'}`,
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.86rem',
            color: message.type === 'success' ? '#34d399' : '#f87171',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {message.text}
          </div>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* TAB 1: REGISTROS DE STOCK DE SEGURIDAD EXISTENTES */}
      {activeTab === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* 2 Focused Stat Cards: Total SKUs Existentes VTEX & SKUs en Riesgo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {/* Card 1: Total SKUs en Catálogo */}
            <div
              onClick={() => {
                setFilterStatus('all');
                setCurrentPage(1);
              }}
              style={{
                background: 'rgba(15, 23, 42, 0.55)',
                padding: '1.25rem 1.5rem',
                borderRadius: '16px',
                border: filterStatus === 'all' ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '1.2rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ padding: '0.9rem', background: 'rgba(56, 189, 248, 0.12)', borderRadius: '12px', color: '#38bdf8' }}>
                <Layers size={28} />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total SKUs Existentes (VTEX)
                </span>
                <strong style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff' }}>
                  {globalStats.totalCatalog ? globalStats.totalCatalog.toLocaleString() : '84,572'}
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginTop: '0.15rem' }}>
                  {globalStats.configuredCount ? globalStats.configuredCount.toLocaleString() : '82,674'} con stock de resguardo asignado
                </span>
              </div>
            </div>

            {/* Card 2: SKUs en Riesgo de Quiebre */}
            <div
              onClick={() => {
                setFilterStatus('at_risk');
                setCurrentPage(1);
              }}
              style={{
                background: filterStatus === 'at_risk' ? 'rgba(239, 68, 68, 0.14)' : 'rgba(15, 23, 42, 0.55)',
                padding: '1.25rem 1.5rem',
                borderRadius: '16px',
                border: filterStatus === 'at_risk' ? '1px solid #ef4444' : '1px solid rgba(239, 68, 68, 0.28)',
                display: 'flex',
                alignItems: 'center',
                gap: '1.2rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: filterStatus === 'at_risk' ? '0 0 25px rgba(239, 68, 68, 0.2)' : 'none',
              }}
            >
              <div style={{ padding: '0.9rem', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '12px', color: '#ef4444' }}>
                <AlertTriangle size={28} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    SKUs en Riesgo de Quiebre
                  </span>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 600 }}>
                    Click para filtrar
                  </span>
                </div>
                <strong style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444' }}>
                  {globalStats.atRiskCount ? globalStats.atRiskCount.toLocaleString() : '55,947'}
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginTop: '0.15rem' }}>
                  Stock Físico en tiendas/bodegas insuficiente (≤ Resguardo)
                </span>
              </div>
            </div>
          </div>

          {/* Search & Status Filters Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: 'rgba(15, 23, 42, 0.4)', padding: '0.85rem 1rem', borderRadius: '14px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '280px', maxWidth: '420px' }}>
              <Search size={17} color="#64748b" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Buscar por SKU ID, producto, marca o categoría..."
                style={{
                  width: '100%',
                  padding: '0.55rem 0.85rem 0.55rem 2.4rem',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '0.86rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Selector de Estado de Resguardo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', background: 'rgba(30, 41, 59, 0.7)', borderRadius: '10px', padding: '0.2rem', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <button
                  onClick={() => {
                    setFilterStatus('all');
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: filterStatus === 'all' ? 'var(--accent-primary)' : 'transparent',
                    color: filterStatus === 'all' ? '#ffffff' : '#94a3b8',
                  }}
                >
                  Todos ({globalStats.totalCatalog ? globalStats.totalCatalog.toLocaleString() : '84,572'})
                </button>
                <button
                  onClick={() => {
                    setFilterStatus('at_risk');
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: filterStatus === 'at_risk' ? '#ef4444' : 'rgba(239, 68, 68, 0.12)',
                    color: filterStatus === 'at_risk' ? '#ffffff' : '#f87171',
                  }}
                >
                  ⚠️ En Riesgo ({globalStats.atRiskCount ? globalStats.atRiskCount.toLocaleString() : '0'})
                </button>
                <button
                  onClick={() => {
                    setFilterStatus('with_safety');
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: filterStatus === 'with_safety' ? 'var(--accent-primary)' : 'transparent',
                    color: filterStatus === 'with_safety' ? '#ffffff' : '#94a3b8',
                  }}
                >
                  Con Resguardo (&gt;0)
                </button>
                <button
                  onClick={() => {
                    setFilterStatus('without_safety');
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: filterStatus === 'without_safety' ? 'var(--accent-primary)' : 'transparent',
                    color: filterStatus === 'without_safety' ? '#ffffff' : '#94a3b8',
                  }}
                >
                  Sin Resguardo (=0)
                </button>
              </div>

              <button
                onClick={fetchSafetyStockItems}
                title="Refrescar datos"
                style={{
                  padding: '0.55rem 0.95rem',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  color: '#94a3b8',
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <RefreshCw size={15} className={isLoadingItems ? 'animate-spin' : ''} />
                Actualizar
              </button>

              {/* Botón Exportar a Excel */}
              <button
                onClick={handleExportExcel}
                disabled={isExporting}
                title="Exportar listado a Excel (.xlsx) respetando filtros activos"
                style={{
                  padding: '0.55rem 1.05rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                  background: isExporting ? 'rgba(52, 211, 153, 0.25)' : 'rgba(52, 211, 153, 0.12)',
                  color: '#34d399',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: isExporting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  transition: 'all 0.2s ease',
                  opacity: isExporting ? 0.7 : 1,
                  boxShadow: '0 2px 10px rgba(52, 211, 153, 0.1)',
                }}
              >
                <Download size={15} className={isExporting ? 'animate-bounce' : ''} />
                {isExporting ? 'Exportando Excel...' : 'Exportar a Excel (.xlsx)'}
              </button>
            </div>
          </div>

          {/* Interactive Data Table con Marca, Categoría y Semáforo */}
          <div style={{ borderRadius: '14px', border: '1px solid var(--border-subtle)', overflow: 'hidden', background: '#04070d' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(15, 23, 42, 0.9)', color: 'var(--text-muted)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '0.9rem 1rem', width: '120px' }}>SKU ID</th>
                    <th style={{ padding: '0.9rem 1rem', minWidth: '260px' }}>Producto (Nombre VTEX)</th>
                    <th style={{ padding: '0.9rem 1rem', minWidth: '130px' }}>Marca</th>
                    <th style={{ padding: '0.9rem 1rem', minWidth: '140px' }}>Categoría</th>
                    <th style={{ padding: '0.9rem 1rem', textAlign: 'center', width: '110px' }}>Stock Físico</th>
                    <th style={{ padding: '0.9rem 1rem', textAlign: 'center', width: '150px' }}>Stock Resguardo</th>
                    <th style={{ padding: '0.9rem 1rem', textAlign: 'center', width: '130px' }}>Estado / Riesgo</th>
                    <th style={{ padding: '0.9rem 1rem', textAlign: 'right', width: '90px' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingItems ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                        Cargando catálogo con Stock de Seguridad desde Supabase...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                        No se encontraron productos coincidentes con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const isEditing = editingRowId === item.sku_id;
                      const isSaving = savingRowId === item.sku_id;
                      const isJustSaved = savedRowId === item.sku_id;

                      return (
                        <tr
                          key={item.sku_id}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                            background: isJustSaved
                              ? 'rgba(52, 211, 153, 0.08)'
                              : item.is_at_risk
                              ? 'rgba(239, 68, 68, 0.03)'
                              : 'transparent',
                            transition: 'background 0.3s ease',
                          }}
                        >
                          {/* SKU ID */}
                          <td style={{ padding: '0.8rem 1rem' }}>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: '#ffffff',
                                background: 'rgba(56, 189, 248, 0.12)',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(56, 189, 248, 0.25)',
                                fontSize: '0.84rem',
                                display: 'inline-block',
                              }}
                            >
                              {item.sku_id}
                            </span>
                          </td>

                          {/* Nombre VTEX */}
                          <td style={{ padding: '0.8rem 1rem', color: '#e2e8f0', fontWeight: 500 }}>
                            {item.name || item.description || <span style={{ color: '#64748b' }}>Sin nombre</span>}
                          </td>

                          {/* Marca */}
                          <td style={{ padding: '0.8rem 1rem' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                background: 'rgba(168, 85, 247, 0.12)',
                                color: '#c084fc',
                                border: '1px solid rgba(168, 85, 247, 0.25)',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '6px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                              }}
                            >
                              <Tag size={11} />
                              {item.brand || 'SINSA'}
                            </span>
                          </td>

                          {/* Categoría */}
                          <td style={{ padding: '0.8rem 1rem' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                background: 'rgba(148, 163, 184, 0.1)',
                                color: '#cbd5e1',
                                border: '1px solid rgba(148, 163, 184, 0.18)',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '6px',
                                fontSize: '0.78rem',
                              }}
                            >
                              <Folder size={11} />
                              {item.category || 'General'}
                            </span>
                          </td>

                          {/* Stock Físico */}
                          <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: '0.88rem',
                                color: item.total_stock > 0 ? '#38bdf8' : '#64748b',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              <Box size={13} style={{ opacity: 0.7 }} />
                              {item.total_stock} un.
                            </span>
                          </td>

                          {/* Editable Safety Stock Input */}
                          <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                            {isEditing ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={editStockValue}
                                  onChange={(e) => setEditStockValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveInline(item);
                                    if (e.key === 'Escape') setEditingRowId(null);
                                  }}
                                  autoFocus
                                  style={{
                                    width: '80px',
                                    padding: '0.3rem 0.45rem',
                                    background: '#1e293b',
                                    border: '1px solid #38bdf8',
                                    borderRadius: '8px',
                                    color: '#ffffff',
                                    fontWeight: 700,
                                    fontSize: '0.88rem',
                                    textAlign: 'center',
                                    outline: 'none',
                                  }}
                                />
                                <button
                                  onClick={() => handleSaveInline(item)}
                                  disabled={isSaving}
                                  title="Guardar cambio"
                                  style={{
                                    padding: '0.35rem',
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    border: 'none',
                                    borderRadius: '7px',
                                    color: '#ffffff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                >
                                  {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                                </button>
                                <button
                                  onClick={() => setEditingRowId(null)}
                                  title="Cancelar"
                                  style={{
                                    padding: '0.35rem',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '7px',
                                    color: '#94a3b8',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  setEditingRowId(item.sku_id);
                                  setEditStockValue(String(item.safety_stock || 0));
                                }}
                                title="Haz clic para editar el resguardo"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.4rem',
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '8px',
                                  background: item.safety_stock > 0 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                                  border: `1px solid ${item.safety_stock > 0 ? 'rgba(245, 158, 11, 0.25)' : 'rgba(100, 116, 139, 0.25)'}`,
                                  color: item.safety_stock > 0 ? '#fbbf24' : '#94a3b8',
                                  fontWeight: 800,
                                  fontSize: '0.86rem',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                {isJustSaved ? (
                                  <>
                                    <Check size={14} color="#34d399" />
                                    <span style={{ color: '#34d399' }}>{item.safety_stock} un.</span>
                                  </>
                                ) : (
                                  <>
                                    <span>{item.safety_stock} un.</span>
                                    <Edit3 size={13} style={{ opacity: 0.6 }} />
                                  </>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Semáforo de Riesgo */}
                          <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                            {item.safety_stock === 0 ? (
                              <span style={{ color: '#64748b', fontSize: '0.78rem' }}>— Sin resguardo</span>
                            ) : item.is_at_risk ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#f87171',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                }}
                              >
                                <AlertTriangle size={12} />
                                En Riesgo
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  background: 'rgba(52, 211, 153, 0.12)',
                                  color: '#34d399',
                                  border: '1px solid rgba(52, 211, 153, 0.25)',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                }}
                              >
                                <CheckCircle2 size={12} />
                                Normal
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                              <button
                                onClick={() => {
                                  setEditingRowId(item.sku_id);
                                  setEditStockValue(String(item.safety_stock || 0));
                                }}
                                title="Editar resguardo"
                                style={{
                                  background: 'rgba(56, 189, 248, 0.12)',
                                  border: '1px solid rgba(56, 189, 248, 0.25)',
                                  color: '#38bdf8',
                                  borderRadius: '7px',
                                  padding: '0.4rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(item)}
                                title="Restablecer resguardo a 0"
                                style={{
                                  background: 'rgba(244, 63, 94, 0.12)',
                                  border: '1px solid rgba(244, 63, 94, 0.25)',
                                  color: '#f43f5e',
                                  borderRadius: '7px',
                                  padding: '0.4rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.85rem 1.25rem',
                background: 'rgba(15, 23, 42, 0.9)',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '0.84rem',
                color: '#94a3b8',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div>
                Mostrando{' '}
                <strong style={{ color: '#ffffff' }}>
                  {totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalRecords)}
                </strong>{' '}
                de <strong style={{ color: '#38bdf8' }}>{totalRecords.toLocaleString()}</strong> productos
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>Filas por página:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{
                      background: '#1e293b',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#ffffff',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.82rem',
                    }}
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <button
                    disabled={currentPage <= 1 || isLoadingItems}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    style={{
                      padding: '0.35rem 0.75rem',
                      background: currentPage <= 1 ? 'rgba(255, 255, 255, 0.04)' : 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: currentPage <= 1 ? '#64748b' : '#38bdf8',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ◀ Anterior
                  </button>
                  <span>
                    Página <strong style={{ color: '#ffffff' }}>{currentPage}</strong> de {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages || isLoadingItems}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    style={{
                      padding: '0.35rem 0.75rem',
                      background: currentPage >= totalPages ? 'rgba(255, 255, 255, 0.04)' : 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: currentPage >= totalPages ? '#64748b' : '#38bdf8',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Siguiente ▶
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Carga de Excel / CSV de 2 Columnas */}
      {activeTab === 'upload' && (
        <div>
          <div
            style={{
              border: '2px dashed var(--border-subtle)',
              borderRadius: '16px',
              padding: '2rem 1.5rem',
              textAlign: 'center',
              background: 'rgba(15, 23, 42, 0.3)',
              marginBottom: '1.25rem',
            }}
          >
            <Upload size={36} color="var(--accent-primary)" style={{ margin: '0 auto 0.75rem auto', opacity: 0.85 }} />
            <h3 style={{ fontWeight: 700, fontSize: '1.05rem', color: '#ffffff', margin: '0 0 0.35rem 0' }}>
              Carga Masiva Ultra Ligera (Solo 2 Columnas)
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '580px', margin: '0 auto 1.25rem auto', lineHeight: '1.5' }}>
              Ahora no necesitas incluir descripciones manuales. El sistema vinculará automáticamente el SKU con el nombre oficial, marca y categoría de VTEX.
            </p>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(30, 41, 59, 0.6)', padding: '0.5rem 1rem', borderRadius: '10px', marginBottom: '1.25rem', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Columnas requeridas:</span>
              <code style={{ color: '#38bdf8', fontWeight: 700, background: 'rgba(56, 189, 248, 0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>SKU</code>
              <span style={{ color: '#64748b' }}>+</span>
              <code style={{ color: '#34d399', fontWeight: 700, background: 'rgba(52, 211, 153, 0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>STOCK_SEGURIDAD</code>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={handleDownloadTemplate}
                className="btn-secondary"
                style={{ cursor: 'pointer', padding: '0.55rem 1.15rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <Download size={15} /> Descargar Plantilla Modelo (.xlsx)
              </button>

              <label className="btn-primary" style={{ cursor: 'pointer', padding: '0.55rem 1.35rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={16} />
                {fileName ? fileName : 'Seleccionar Archivo Excel o CSV'}
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          {/* Previsualización del archivo cargado */}
          {parsedRows.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.88rem', color: '#38bdf8', fontWeight: 600 }}>
                  ✓ {parsedRows.length.toLocaleString()} filas listas para sincronizar en Supabase
                </span>

                <button onClick={handleSaveBulk} disabled={loading} className="btn-primary" style={{ padding: '0.5rem 1.15rem', fontSize: '0.86rem' }}>
                  {loading ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  {loading ? 'Guardando en catálogo...' : 'Confirmar y Guardar en Supabase'}
                </button>
              </div>

              <div style={{ maxHeight: '200px', overflowY: 'auto', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: '#04070d' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(15, 23, 42, 0.9)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.6rem 1rem' }}>#</th>
                      <th style={{ padding: '0.6rem 1rem' }}>SKU ID</th>
                      <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>Stock de Resguardo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 60).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '0.45rem 1rem', color: '#64748b' }}>{i + 1}</td>
                        <td style={{ padding: '0.45rem 1rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#ffffff' }}>{r.skuId}</td>
                        <td style={{ padding: '0.45rem 1rem', textAlign: 'right', fontWeight: 700, color: '#fbbf24' }}>{r.safetyStock} un.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Confirmar Eliminación / Restablecimiento */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ width: '100%', maxWidth: '420px', background: '#0f172a', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '20px', padding: '1.75rem', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', padding: '0.85rem', background: 'rgba(244, 63, 94, 0.15)', borderRadius: '50%', marginBottom: '1rem', color: '#f43f5e' }}>
              <ShieldAlert size={32} />
            </div>
            <h3 style={{ color: '#ffffff', fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
              ¿Restablecer Stock de Seguridad?
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1.5rem 0', lineHeight: '1.5' }}>
              Esta acción fijará el stock de seguridad en <strong style={{ color: '#ffffff' }}>0</strong> para el SKU{' '}
              <strong style={{ color: '#38bdf8' }}>{deleteTarget.sku_id}</strong> ({deleteTarget.name || 'Producto'}).
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: '0.75rem', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleDeleteItem} style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', borderRadius: '10px', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>
                Sí, Restablecer a 0
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
