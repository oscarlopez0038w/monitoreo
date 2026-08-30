'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Upload,
  Plus,
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
} from 'lucide-react';
import * as XLSX from 'xlsx';

export default function SafetyStockPanel({ onSafetyStockUpdated }) {
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'upload' | 'single'
  const [items, setItems] = useState([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Estados de Edición Inline
  const [editingRowId, setEditingRowId] = useState(null);
  const [editStockValue, setEditStockValue] = useState('');
  const [savingRowId, setSavingRowId] = useState(null);
  const [savedRowId, setSavedRowId] = useState(null);

  // Carga de Excel / CSV
  const [parsedRows, setParsedRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState(null);

  // Formulario manual
  const [singleSku, setSingleSku] = useState('');
  const [singleDescription, setSingleDescription] = useState('');
  const [singleStock, setSingleStock] = useState('0');

  // Paginación y conteo exacto de Supabase (65.2K+)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Modal confirmación eliminación
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Cargar lista existente desde la BD (vtex_safety_stock) con conteo exacto y paginación
  const fetchSafetyStockItems = useCallback(async () => {
    setIsLoadingItems(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      params.set('page', String(currentPage));
      params.set('pageSize', String(pageSize));

      const res = await fetch(`/api/skus/safety-stock?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
        setTotalRecords(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error('Error cargando stock de seguridad:', err);
    } finally {
      setIsLoadingItems(false);
    }
  }, [searchTerm, currentPage, pageSize]);

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
          description: item.description,
          safetyStock: newStock,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Actualizar localmente
        setItems((prev) =>
          prev.map((r) =>
            r.sku_id === item.sku_id
              ? { ...r, safety_stock: newStock, updated_at: new Date().toISOString() }
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

  // Eliminar un registro de Stock de Seguridad
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

  // Helper para procesar una hoja concreta de Excel
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

    let descIdx = lowerHeaders.findIndex(
      (h) => h.includes('descrip') || h.includes('nombre') || h.includes('product') || h === 'description'
    );
    if (descIdx === -1) descIdx = 1;

    let stockIdx = lowerHeaders.findIndex(
      (h) =>
        h.includes('stock') ||
        h.includes('seguridad') ||
        h.includes('safety') ||
        h.includes('threshold') ||
        h.includes('minimo') ||
        h.includes('mínimo') ||
        h.includes('recomendad')
    );
    if (stockIdx === -1) stockIdx = 2;

    const dataRows = matrix.slice(headerRowIdx + 1);
    const rows = [];

    for (const r of dataRows) {
      const rawSku = r[skuIdx];
      if (rawSku == null || rawSku === '') continue;

      const cleanSkuStr = String(rawSku).replace(/\.0$/, '').trim();
      const skuNum = parseInt(cleanSkuStr, 10);
      if (isNaN(skuNum) || skuNum <= 0) continue;

      const desc = r[descIdx] ? String(r[descIdx]).trim() : null;
      const rawStock = r[stockIdx];
      const safetyStock =
        typeof rawStock === 'number'
          ? Math.round(rawStock)
          : parseInt(String(rawStock).replace(/,/g, ''), 10) || 0;

      rows.push({
        skuId: skuNum,
        description: desc,
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
        text: `Se leyeron ${bestResult.rows.length.toLocaleString()} filas de la hoja "${bestSheetName}".`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: `Error procesando el archivo: ${err.message}` });
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

  // Guardar individual
  const handleSaveSingle = async (e) => {
    e.preventDefault();
    const skuNum = parseInt(singleSku.trim(), 10);
    if (isNaN(skuNum)) {
      setMessage({ type: 'error', text: 'Ingresa un SKU ID válido.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/skus/safety-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: skuNum,
          description: singleDescription.trim(),
          safetyStock: parseInt(singleStock, 10) || 0,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Stock de seguridad asignado al SKU ${skuNum}.` });
        setSingleSku('');
        setSingleDescription('');
        setSingleStock('0');
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

  // Estadísticas agregadas
  const totalConfigured = items.length;
  const avgStock = items.length > 0 ? Math.round(items.reduce((acc, curr) => acc + (curr.safety_stock || 0), 0) / items.length) : 0;
  const maxStockItem = items.length > 0 ? [...items].sort((a, b) => (b.safety_stock || 0) - (a.safety_stock || 0))[0] : null;

  return (
    <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      
      {/* Panel Header & Navigation Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }} className="mobile-stack">
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.25rem 0' }}>
            <ShieldAlert size={22} color="var(--accent-amber)" />
            Gestión y Modificación de Stock de Seguridad
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Visualiza, edita en tiempo real o carga umbrales de resguardo para el catálogo VTEX
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
            <Layers size={15} /> Registros Existentes ({totalRecords.toLocaleString()})
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
            <Upload size={15} /> Cargar Excel / CSV
          </button>
          <button
            onClick={() => setActiveTab('single')}
            style={{
              padding: '0.45rem 0.95rem',
              borderRadius: '9px',
              border: 'none',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'single' ? 'var(--gradient-btn)' : 'transparent',
              color: activeTab === 'single' ? '#ffffff' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease',
            }}
          >
            <Plus size={15} /> Agregar Individual
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

      {/* TAB 1: REGISTROS DE STOCK DE SEGURIDAD EXISTENTES Y EDICIÓN RÁPIDA */}
      {activeTab === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Summary Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '1rem', borderRadius: '14px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(245, 158, 11, 0.12)', borderRadius: '10px', color: '#fbbf24' }}>
                <ShieldAlert size={22} />
              </div>
              <div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>SKUs Configurados</span>
                <strong style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>{totalRecords.toLocaleString()}</strong>
              </div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '1rem', borderRadius: '14px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(56, 189, 248, 0.12)', borderRadius: '10px', color: '#38bdf8' }}>
                <TrendingUp size={22} />
              </div>
              <div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Promedio de Resguardo</span>
                <strong style={{ fontSize: '1.35rem', fontWeight: 800, color: '#38bdf8' }}>{avgStock.toLocaleString()} un.</strong>
              </div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '1rem', borderRadius: '14px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(52, 211, 153, 0.12)', borderRadius: '10px', color: '#34d399' }}>
                <Layers size={22} />
              </div>
              <div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Mayor Umbral</span>
                <strong style={{ fontSize: '1.35rem', fontWeight: 800, color: '#34d399' }}>
                  {maxStockItem ? `${maxStockItem.safety_stock.toLocaleString()} un.` : '0 un.'}
                </strong>
              </div>
            </div>
          </div>

          {/* Search & Action Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: 'rgba(15, 23, 42, 0.4)', padding: '0.85rem 1rem', borderRadius: '14px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '420px' }}>
              <Search size={17} color="#64748b" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por SKU ID o nombre del producto..."
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
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
                Actualizar Lista
              </button>
            </div>
          </div>

          {/* Interactive Data Table */}
          <div style={{ borderRadius: '14px', border: '1px solid var(--border-subtle)', overflow: 'hidden', background: '#04070d' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(15, 23, 42, 0.9)', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '0.9rem 1.25rem' }}>SKU ID</th>
                    <th style={{ padding: '0.9rem 1.25rem' }}>Descripción / Nombre</th>
                    <th style={{ padding: '0.9rem 1.25rem', textAlign: 'center', minWidth: '180px' }}>Stock de Seguridad</th>
                    <th style={{ padding: '0.9rem 1.25rem' }}>Última Actualización</th>
                    <th style={{ padding: '0.9rem 1.25rem', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingItems ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                        Cargando registros de Stock de Seguridad desde Supabase...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                        No se encontraron registros de Stock de Seguridad configurados.
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
                            background: isJustSaved ? 'rgba(52, 211, 153, 0.08)' : 'transparent',
                            transition: 'background 0.3s ease',
                          }}
                        >
                          {/* SKU ID */}
                          <td style={{ padding: '0.85rem 1.25rem' }}>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: '#ffffff',
                                background: 'rgba(56, 189, 248, 0.12)',
                                padding: '0.25rem 0.6rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(56, 189, 248, 0.25)',
                                fontSize: '0.88rem',
                              }}
                            >
                              {item.sku_id}
                            </span>
                          </td>

                          {/* Description */}
                          <td style={{ padding: '0.85rem 1.25rem', color: '#e2e8f0' }}>
                            {item.description || <span style={{ color: '#64748b', italic: true }}>Sin descripción</span>}
                          </td>

                          {/* Editable Safety Stock Input */}
                          <td style={{ padding: '0.85rem 1.25rem', textAlign: 'center' }}>
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
                                    width: '90px',
                                    padding: '0.35rem 0.5rem',
                                    background: '#1e293b',
                                    border: '1px solid #38bdf8',
                                    borderRadius: '8px',
                                    color: '#ffffff',
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    textAlign: 'center',
                                    outline: 'none',
                                  }}
                                />
                                <button
                                  onClick={() => handleSaveInline(item)}
                                  disabled={isSaving}
                                  title="Guardar cambio"
                                  style={{
                                    padding: '0.4rem',
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: '#ffffff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                >
                                  {isSaving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                                </button>
                                <button
                                  onClick={() => setEditingRowId(null)}
                                  title="Cancelar"
                                  style={{
                                    padding: '0.4rem',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '8px',
                                    color: '#94a3b8',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                >
                                  <X size={15} />
                                </button>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  setEditingRowId(item.sku_id);
                                  setEditStockValue(String(item.safety_stock || 0));
                                }}
                                title="Haz clic para modificar el stock de seguridad"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  padding: '0.3rem 0.75rem',
                                  borderRadius: '10px',
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  border: '1px solid rgba(245, 158, 11, 0.25)',
                                  color: '#fbbf24',
                                  fontWeight: 800,
                                  fontSize: '0.9rem',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                {isJustSaved ? (
                                  <>
                                    <Check size={16} color="#34d399" />
                                    <span style={{ color: '#34d399' }}>{item.safety_stock} un.</span>
                                  </>
                                ) : (
                                  <>
                                    <span>{item.safety_stock} un.</span>
                                    <Edit3 size={14} style={{ opacity: 0.6 }} />
                                  </>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Updated At */}
                          <td style={{ padding: '0.85rem 1.25rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                            {item.updated_at
                              ? new Date(item.updated_at).toLocaleString('es-NI')
                              : 'Registrado'}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                              <button
                                onClick={() => {
                                  setEditingRowId(item.sku_id);
                                  setEditStockValue(String(item.safety_stock || 0));
                                }}
                                title="Editar umbral"
                                style={{
                                  background: 'rgba(56, 189, 248, 0.12)',
                                  border: '1px solid rgba(56, 189, 248, 0.25)',
                                  color: '#38bdf8',
                                  borderRadius: '8px',
                                  padding: '0.45rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                              >
                                <Edit3 size={15} />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(item)}
                                title="Eliminar registro"
                                style={{
                                  background: 'rgba(244, 63, 94, 0.12)',
                                  border: '1px solid rgba(244, 63, 94, 0.25)',
                                  color: '#f43f5e',
                                  borderRadius: '8px',
                                  padding: '0.45rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                              >
                                <Trash2 size={15} />
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
                de <strong style={{ color: '#38bdf8' }}>{totalRecords.toLocaleString()}</strong> registros en Supabase
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

      {/* TAB 2: CSV Upload */}
      {activeTab === 'upload' && (
        <div>
          <div
            style={{
              border: '2px dashed var(--border-subtle)',
              borderRadius: '12px',
              padding: '1.5rem',
              textAlign: 'center',
              background: 'rgba(15, 23, 42, 0.3)',
              marginBottom: '1rem',
            }}
          >
            <Upload size={32} color="var(--accent-primary)" style={{ margin: '0 auto 0.5rem auto', opacity: 0.8 }} />
            <p style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.2rem' }}>
              Selecciona o arrastra tu archivo Excel (.xlsx / .xls)
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '1.0rem' }}>
              Formato de columnas: <code style={{ color: '#ffffff' }}>sku</code>, <code style={{ color: '#ffffff' }}>description</code>, <code style={{ color: '#ffffff' }}>safety_stock</code>
            </p>

            <label className="btn-secondary" style={{ cursor: 'pointer', padding: '0.55rem 1.35rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={16} color="var(--accent-primary)" />
              {fileName ? fileName : 'Examinar archivo Excel (.xlsx, .xls, .csv)'}
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          </div>

          {parsedRows.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Vista previa ({parsedRows.length.toLocaleString()} filas listas para guardar)
                </span>

                <button onClick={handleSaveBulk} disabled={loading} className="btn-primary" style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}>
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {loading ? 'Guardando...' : 'Confirmar y Guardar en Supabase'}
                </button>
              </div>

              <div style={{ maxHeight: '160px', overflowY: 'auto', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: '#04070d' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(15, 23, 42, 0.9)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.5rem 0.8rem' }}>SKU ID</th>
                      <th style={{ padding: '0.5rem 0.8rem' }}>Descripción</th>
                      <th style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>Stock Seguridad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 50).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '0.4rem 0.8rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#ffffff' }}>{r.skuId}</td>
                        <td style={{ padding: '0.4rem 0.8rem', color: 'var(--text-main)' }}>{r.description || '-'}</td>
                        <td style={{ padding: '0.4rem 0.8rem', textAlign: 'right', fontWeight: 700, color: 'var(--accent-amber)' }}>{r.safetyStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Single Manual Form */}
      {activeTab === 'single' && (
        <form onSubmit={handleSaveSingle} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
              SKU ID *
            </label>
            <input
              type="number"
              className="glass-input"
              style={{ width: '100%', fontSize: '0.88rem' }}
              placeholder="Ej: 100992271"
              value={singleSku}
              onChange={(e) => setSingleSku(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
              Descripción / Nombre
            </label>
            <input
              type="text"
              className="glass-input"
              style={{ width: '100%', fontSize: '0.88rem' }}
              placeholder="Ej: Taladro Percutor 1/2 Dual"
              value={singleDescription}
              onChange={(e) => setSingleDescription(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
              Stock de Seguridad *
            </label>
            <input
              type="number"
              className="glass-input"
              style={{ width: '100%', fontSize: '0.88rem' }}
              placeholder="Ej: 10"
              value={singleStock}
              onChange={(e) => setSingleStock(e.target.value)}
              required
              min="0"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary" style={{ padding: '0.65rem 1.25rem', fontSize: '0.88rem', height: '42px', justifyContent: 'center' }}>
            {loading ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />}
            {loading ? 'Guardando...' : 'Guardar SKU'}
          </button>
        </form>
      )}

      {/* MODAL: Confirmar Eliminación */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ width: '100%', maxWidth: '400px', background: '#0f172a', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '20px', padding: '1.75rem', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', padding: '0.85rem', background: 'rgba(244, 63, 94, 0.15)', borderRadius: '50%', marginBottom: '1rem', color: '#f43f5e' }}>
              <ShieldAlert size={32} />
            </div>
            <h3 style={{ color: '#ffffff', fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
              ¿Eliminar Stock de Seguridad?
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1.5rem 0', lineHeight: '1.5' }}>
              Esta acción borrará la reserva de stock de seguridad para el SKU <strong style={{ color: '#ffffff' }}>{deleteTarget.sku_id}</strong>.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: '0.75rem', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleDeleteItem} style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', borderRadius: '10px', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
