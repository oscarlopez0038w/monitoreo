'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  RefreshCw,
  Search,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Plus,
  FileSpreadsheet,
  Upload,
  ChevronDown,
  ChevronRight,
  Package,
  Boxes,
  DollarSign,
  Info,
  ShieldCheck,
  ShieldAlert,
  Edit2,
  Tag,
  Check,
  Power,
  Eye,
  EyeOff,
} from 'lucide-react';

export default function MiniSplitKitsPanel() {
  const [kits, setKits] = useState([]);
  const [stats, setStats] = useState({
    totalKits: 0,
    activeKits: 0,
    readyKits: 0,
    kitsWithAlerts: 0,
    priceMismatches: 0,
    zeroStockKits: 0,
    inactiveComponentsKits: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filtros y búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'READY' | 'NO_STOCK' | 'COMPONENT_INACTIVE' | 'KIT_INACTIVE' | 'PRICE_MISMATCH'

  // Filas expandidas (Set de SKU IDs de Kit)
  const [expandedKits, setExpandedKits] = useState(new Set());

  // Modal para agregar SKU Kit
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newSkuInput, setNewSkuInput] = useState('');
  const [newSkuDesc, setNewSkuDesc] = useState('');
  const [addingSku, setAddingSku] = useState(false);
  const [addFeedback, setAddFeedback] = useState(null);

  // Modal para editar precio de SKU (Kit o Componente)
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [targetSkuToEdit, setTargetSkuToEdit] = useState(null); // { skuId, name, currentPrice, isKit }
  const [newPriceInput, setNewPriceInput] = useState('');
  const [updatingPrice, setUpdatingPrice] = useState(false);
  const [priceEditFeedback, setPriceEditFeedback] = useState(null);

  // Estado de activación/desactivación en progreso
  const [togglingSkuId, setTogglingSkuId] = useState(null);
  const [togglingDisplaySkuId, setTogglingDisplaySkuId] = useState(null);

  // Modal de Importación Excel
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [parsedExcelItems, setParsedExcelItems] = useState([]);
  const [parsingExcel, setParsingExcel] = useState(false);
  const [importingExcel, setImportingExcel] = useState(false);
  const [excelFeedback, setExcelFeedback] = useState(null);

  // Procesar archivo Excel subido
  const handleExcelFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelFile(file);
    setParsingExcel(true);
    setExcelFeedback(null);
    setParsedExcelItems([]);

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (!jsonRows || jsonRows.length === 0) {
        throw new Error('El archivo Excel no contiene filas o está vacío.');
      }

      const detectedSkus = [];
      const firstRow = jsonRows[0] || [];
      let skuColIndex = -1;
      let descColIndex = -1;

      if (Array.isArray(firstRow)) {
        firstRow.forEach((cell, idx) => {
          const val = String(cell || '').toLowerCase().trim();
          if (val.includes('sku') || val.includes('bundle') || val.includes('kit') || val.includes('id') || val.includes('código')) {
            if (skuColIndex === -1) skuColIndex = idx;
          }
          if (val.includes('desc') || val.includes('nombre') || val.includes('name')) {
            if (descColIndex === -1) descColIndex = idx;
          }
        });
      }

      if (skuColIndex === -1) skuColIndex = 0;

      const startRowIndex = (typeof firstRow[skuColIndex] === 'string' && isNaN(Number(firstRow[skuColIndex]))) ? 1 : 0;

      for (let i = startRowIndex; i < jsonRows.length; i++) {
        const row = jsonRows[i];
        if (!row || !Array.isArray(row)) continue;

        const rawSku = String(row[skuColIndex] || '').trim();
        const rawDesc = descColIndex !== -1 ? String(row[descColIndex] || '').trim() : '';

        const skuMatch = rawSku.match(/\d+/);
        if (skuMatch) {
          const skuId = skuMatch[0];
          if (skuId.length >= 4) {
            detectedSkus.push({
              skuId,
              description: rawDesc || `Kit SKU ${skuId}`
            });
          }
        }
      }

      const uniqueSkusMap = new Map();
      detectedSkus.forEach((item) => {
        if (!uniqueSkusMap.has(item.skuId)) {
          uniqueSkusMap.set(item.skuId, item);
        }
      });

      const finalParsedList = Array.from(uniqueSkusMap.values());

      if (finalParsedList.length === 0) {
        throw new Error('No se detectaron IDs de SKU numéricos válidos en las columnas del archivo Excel.');
      }

      setParsedExcelItems(finalParsedList);
      setExcelFeedback({
        type: 'info',
        message: `Se detectaron ${finalParsedList.length} SKUs de Kit en "${file.name}". Haz clic en "Importar a Supabase" para comparar e importar sólo los nuevos.`
      });
    } catch (err) {
      console.error('Error procesando Excel:', err);
      setExcelFeedback({ type: 'error', message: err.message || 'Error al procesar el archivo Excel.' });
    } finally {
      setParsingExcel(false);
    }
  };

  // Enviar SKUs importados del Excel al backend
  const handleSubmitExcelImport = async () => {
    if (parsedExcelItems.length === 0) return;

    setImportingExcel(true);
    setExcelFeedback(null);

    try {
      const res = await fetch('/api/minisplits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import_excel',
          skus: parsedExcelItems,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setExcelFeedback({
        type: 'success',
        message: data.message,
      });

      setTimeout(() => {
        setIsExcelModalOpen(false);
        setExcelFeedback(null);
        setExcelFile(null);
        setParsedExcelItems([]);
        fetchKits(true);
      }, 2500);
    } catch (err) {
      setExcelFeedback({ type: 'error', message: err.message });
    } finally {
      setImportingExcel(false);
    }
  };

  // Cargar datos del API
  const fetchKits = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/minisplits');
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Error al obtener datos de Kits Mini Split');
      }

      setKits(data.kits || []);
      setStats(data.stats || {});

      // Por defecto expandir todos los kits para ver sus componentes de un vistazo
      if (!isManualRefresh) {
        const initialExpanded = new Set((data.kits || []).map((k) => k.skuId));
        setExpandedKits(initialExpanded);
      }
    } catch (err) {
      console.error('Error fetching mini split kits:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchKits();
  }, []);

  // Alternar expansión de componentes por Kit
  const toggleExpand = (skuId) => {
    setExpandedKits((prev) => {
      const next = new Set(prev);
      if (next.has(skuId)) next.delete(skuId);
      else next.add(skuId);
      return next;
    });
  };

  // Expandir / Colapsar todos
  const toggleExpandAll = () => {
    if (expandedKits.size === kits.length) {
      setExpandedKits(new Set());
    } else {
      setExpandedKits(new Set(kits.map((k) => k.skuId)));
    }
  };

  // Activar o Desactivar SKU (Kit o Componente) en VTEX Catalog
  const handleToggleActive = async (e, skuId, activate) => {
    e.stopPropagation(); // Evitar colapsar/expandir la fila al hacer clic
    setTogglingSkuId(skuId);

    try {
      const res = await fetch('/api/minisplits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_active',
          skuId,
          activate: Boolean(activate),
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Refrescar kits en vivo para actualizar badges y status
      fetchKits(true);
    } catch (err) {
      alert(`Error al cambiar estado del SKU ${skuId}: ${err.message}`);
    } finally {
      setTogglingSkuId(null);
    }
  };

  // Mostrar u ocultar SKU componente en website VTEX
  const handleToggleDisplayOnSite = async (e, skuId, displayOnSite) => {
    e.stopPropagation();
    setTogglingDisplaySkuId(skuId);

    try {
      const res = await fetch('/api/minisplits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_display_on_site',
          skuId,
          displayOnSite: Boolean(displayOnSite),
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setKits((prevKits) =>
        prevKits.map((kit) => ({
          ...kit,
          components: kit.components.map((comp) =>
            comp.skuId === skuId
              ? { ...comp, displayOnSite: Boolean(displayOnSite), productId: data.productId || comp.productId }
              : comp
          ),
        }))
      );
      fetchKits(true);
    } catch (err) {
      alert(`Error al cambiar visibilidad web del SKU ${skuId}: ${err.message}`);
    } finally {
      setTogglingDisplaySkuId(null);
    }
  };

  // Abrir modal de modificación de precio
  const openEditPriceModal = (e, skuId, name, currentPrice, isKit = false) => {
    e.stopPropagation();
    setTargetSkuToEdit({ skuId, name, currentPrice, isKit });
    setNewPriceInput(String(currentPrice || 0));
    setPriceEditFeedback(null);
    setIsPriceModalOpen(true);
  };

  // Guardar nuevo precio en VTEX
  const handleUpdatePriceSubmit = async (e) => {
    e.preventDefault();
    if (!targetSkuToEdit || !newPriceInput) return;

    setUpdatingPrice(true);
    setPriceEditFeedback(null);

    try {
      const res = await fetch('/api/minisplits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_price',
          skuId: targetSkuToEdit.skuId,
          newBasePrice: Number(newPriceInput),
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setPriceEditFeedback({ type: 'success', message: data.message });
      setTimeout(() => {
        setIsPriceModalOpen(false);
        setPriceEditFeedback(null);
        fetchKits(true); // Refrescar kits en vivo
      }, 1200);
    } catch (err) {
      setPriceEditFeedback({ type: 'error', message: err.message });
    } finally {
      setUpdatingPrice(false);
    }
  };

  // Manejar adición de nuevo SKU Kit
  const handleAddSku = async (e) => {
    e.preventDefault();
    if (!newSkuInput.trim()) return;

    setAddingSku(true);
    setAddFeedback(null);

    try {
      const res = await fetch('/api/minisplits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          skuId: newSkuInput.trim(),
          description: newSkuDesc.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setAddFeedback({ type: 'success', message: data.message });
      setNewSkuInput('');
      setNewSkuDesc('');
      setTimeout(() => {
        setIsAddModalOpen(false);
        setAddFeedback(null);
        fetchKits(true);
      }, 1200);
    } catch (err) {
      setAddFeedback({ type: 'error', message: err.message });
    } finally {
      setAddingSku(false);
    }
  };

  // Filtrado de Kits
  const filteredKits = useMemo(() => {
    return kits.filter((kit) => {
      // Coincidencia de búsqueda
      const searchLower = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !searchLower ||
        kit.skuId.toLowerCase().includes(searchLower) ||
        kit.name.toLowerCase().includes(searchLower) ||
        kit.components.some(
          (c) =>
            c.skuId.toLowerCase().includes(searchLower) ||
            c.name.toLowerCase().includes(searchLower)
        );

      if (!matchesSearch) return false;

      // Filtro por Estado
      if (statusFilter === 'READY') return kit.status === 'READY';
      if (statusFilter === 'NO_STOCK') return kit.status === 'NO_STOCK' || kit.maxBuildableStock <= 0;
      if (statusFilter === 'COMPONENT_INACTIVE') return kit.status === 'COMPONENT_INACTIVE';
      if (statusFilter === 'KIT_INACTIVE') return kit.status === 'KIT_INACTIVE' || !kit.isActive;
      if (statusFilter === 'PRICE_MISMATCH') return Math.abs(kit.priceDifference) > 1;

      return true;
    });
  }, [kits, searchTerm, statusFilter]);

  // Exportar reporte completo a CSV para Excel
  const exportToCsv = () => {
    if (kits.length === 0) return;

    const headers = [
      'SKU Kit',
      'Nombre Kit',
      'Estado VTEX Kit',
      'Estatus Operativo',
      'Precio Kit Base (C$)',
      'Suma Precios Componentes (C$)',
      'Diferencia Paridad (C$)',
      'Stock Armable Disponible (Kits)',
      'SKU Componente',
      'Nombre Componente',
      'Cantidad en Kit',
      'Estado Componente VTEX',
      'Precio Base Componente (C$)',
      'Stock Bodega 24 (WH1)',
      'Stock Bodega 1041 (WH2)',
      'Stock Total Componente',
    ];

    const rows = [];

    kits.forEach((kit) => {
      if (kit.components.length === 0) {
        rows.push([
          `"${kit.skuId}"`,
          `"${kit.name.replace(/"/g, '""')}"`,
          kit.isActive ? 'Activo' : 'Inactivo',
          `"${kit.statusDescription}"`,
          kit.kitPrice.basePrice || 0,
          kit.componentsTotalPrice || 0,
          kit.priceDifference || 0,
          kit.maxBuildableStock || 0,
          'N/A',
          'Sin componentes',
          0,
          'N/A',
          0,
          0,
          0,
          0,
        ]);
      } else {
        kit.components.forEach((comp) => {
          rows.push([
            `"${kit.skuId}"`,
            `"${kit.name.replace(/"/g, '""')}"`,
            kit.isActive ? 'Activo' : 'Inactivo',
            `"${kit.statusDescription}"`,
            kit.kitPrice.basePrice || 0,
            kit.componentsTotalPrice || 0,
            kit.priceDifference || 0,
            kit.maxBuildableStock || 0,
            `"${comp.skuId}"`,
            `"${comp.name.replace(/"/g, '""')}"`,
            comp.quantity || 1,
            comp.isActive ? 'Activo' : 'Inactivo',
            comp.price.basePrice || 0,
            comp.inventory.stockWh1 || 0,
            comp.inventory.stockWh2 || 0,
            comp.inventory.totalStock || 0,
          ]);
        });
      }
    });

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte_kits_minisplit_vtex_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Renderizado de Insignias de Estado
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'READY':
        return (
          <span
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <CheckCircle size={14} /> Listo para Venta
          </span>
        );
      case 'KIT_INACTIVE':
        return (
          <span
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: 'rgba(244, 63, 94, 0.15)',
              color: '#f43f5e',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <XCircle size={14} /> Kit Inactivo
          </span>
        );
      case 'COMPONENT_INACTIVE':
        return (
          <span
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <AlertTriangle size={14} /> Componente Inactivo
          </span>
        );
      case 'NO_STOCK':
        return (
          <span
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: 'rgba(148, 163, 184, 0.15)',
              color: '#94a3b8',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Boxes size={14} /> Sin Stock Disponible
          </span>
        );
      default:
        return (
          <span
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: 'rgba(148, 163, 184, 0.15)',
              color: '#94a3b8',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {status}
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* HEADER BAR CON TÍTULO Y ACCIONES */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'rgba(15, 23, 42, 0.6)',
          padding: '1.25rem 1.5rem',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
              }}
            >
              <Package size={20} color="#ffffff" />
            </div>
            <div>
              <h1
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  margin: 0,
                  background: 'linear-gradient(to right, #ffffff, #cbd5e1)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Monitoreo SKUs Kit Mini Split VTEX
              </h1>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                  margin: '0.2rem 0 0 0',
                }}
              >
                Supervisión en tiempo real de Kits y Componentes, imágenes dedicadas, modificación de precios e interruptores de activación/desactivación en VTEX.
              </p>
            </div>
          </div>
        </div>

        {/* BOTONERA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => fetchKits(true)}
            disabled={loading || refreshing}
            className="btn-secondary"
            style={{
              padding: '0.6rem 1.1rem',
              borderRadius: '10px',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: refreshing ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw
              size={16}
              style={{
                animation: refreshing ? 'spin 1s linear infinite' : 'none',
              }}
              color="#38bdf8"
            />
            {refreshing ? 'Sincronizando VTEX...' : 'Actualizar Datos'}
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-secondary"
            style={{
              padding: '0.6rem 1.1rem',
              borderRadius: '10px',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Plus size={16} color="#a5b4fc" />
            Monitorear Nuevo Kit SKU
          </button>

          <button
            onClick={() => setIsExcelModalOpen(true)}
            className="btn-secondary"
            style={{
              padding: '0.6rem 1.1rem',
              borderRadius: '10px',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
            }}
          >
            <Upload size={16} />
            Subir Excel de Kits
          </button>

          <button
            onClick={exportToCsv}
            disabled={kits.length === 0}
            style={{
              padding: '0.6rem 1.1rem',
              borderRadius: '10px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #059669, #10b981)',
              color: '#ffffff',
              border: 'none',
              cursor: kits.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
            }}
          >
            <FileSpreadsheet size={16} />
            Exportar CSV Excel
          </button>
        </div>
      </div>

      {/* METRIC CARDS (ESTADÍSTICAS DEL MÓDULO) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Card 1: Total Kits */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '14px',
            padding: '1.2rem',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Total Kits Monitoreados
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Layers size={16} color="#38bdf8" />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem', color: '#ffffff' }}>
            {stats.totalKits || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {stats.activeKits || 0} activos en VTEX Catalog
          </div>
        </div>

        {/* Card 2: Listos para Venta */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(52, 211, 153, 0.3)',
            borderRadius: '14px',
            padding: '1.2rem',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Listos para Venta
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(52, 211, 153, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheck size={16} color="#34d399" />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem', color: '#34d399' }}>
            {stats.readyKits || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Kit + componentes activos con stock
          </div>
        </div>

        {/* Card 3: Inactivos / Alertas */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: stats.kitsWithAlerts > 0 ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid var(--border-subtle)',
            borderRadius: '14px',
            padding: '1.2rem',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Alertas / Inactivos
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(244, 63, 94, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldAlert size={16} color="#f43f5e" />
            </div>
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              marginTop: '0.5rem',
              color: stats.kitsWithAlerts > 0 ? '#f43f5e' : '#ffffff',
            }}
          >
            {stats.kitsWithAlerts || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {stats.inactiveComponentsKits || 0} con componente inactivo
          </div>
        </div>

        {/* Card 4: Sin Stock */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '14px',
            padding: '1.2rem',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Sin Stock Armable
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Boxes size={16} color="#fbbf24" />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem', color: '#fbbf24' }}>
            {stats.zeroStockKits || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            0 inventario en componentes
          </div>
        </div>

        {/* Card 5: Desfases de Precio */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '14px',
            padding: '1.2rem',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Diferencia de Precio
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(168, 85, 247, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <DollarSign size={16} color="#c084fc" />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem', color: '#c084fc' }}>
            {stats.priceMismatches || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Precio Kit ≠ Suma de Componentes
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS Y BÚSQUEDA */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          background: 'rgba(15, 23, 42, 0.6)',
          padding: '1rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Input de Búsqueda */}
        <div style={{ position: 'relative', flex: '1', minWidth: '260px' }}>
          <Search
            size={16}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            placeholder="Buscar por SKU Kit, Nombre, o Componente (Evaporador / Condensador)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.55rem 0.8rem 0.55rem 2.3rem',
              borderRadius: '10px',
              border: '1px solid var(--border-subtle)',
              background: 'rgba(30, 41, 59, 0.6)',
              color: '#ffffff',
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
        </div>

        {/* Botones de Filtro por Estado */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {[
            { id: 'ALL', label: 'Todos', count: kits.length },
            { id: 'READY', label: 'Listos', count: stats.readyKits },
            { id: 'NO_STOCK', label: 'Sin Stock', count: stats.zeroStockKits },
            { id: 'COMPONENT_INACTIVE', label: 'Comp. Inactivo', count: stats.inactiveComponentsKits },
            { id: 'KIT_INACTIVE', label: 'Kit Inactivo', count: (stats.totalKits || 0) - (stats.activeKits || 0) },
            { id: 'PRICE_MISMATCH', label: 'Desfase Precio', count: stats.priceMismatches },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: statusFilter === f.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                background: statusFilter === f.id ? 'var(--gradient-btn)' : 'rgba(30, 41, 59, 0.4)',
                color: statusFilter === f.id ? '#ffffff' : 'var(--text-muted)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {f.label} ({f.count || 0})
            </button>
          ))}
        </div>

        {/* Botón Expandir / Colapsar Todos */}
        <button
          onClick={toggleExpandAll}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {expandedKits.size === kits.length ? 'Colapsar Filas' : 'Expandir Componentes'}
        </button>
      </div>

      {/* ERROR FEEDBACK */}
      {error && (
        <div
          style={{
            padding: '1rem',
            borderRadius: '12px',
            background: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#f43f5e',
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {/* TABLA PRINCIPAL DE KITS */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr
                style={{
                  background: 'rgba(30, 41, 59, 0.8)',
                  borderBottom: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  fontSize: '0.78rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <th style={{ padding: '0.85rem 1rem', width: '40px' }}></th>
                <th style={{ padding: '0.85rem 1rem' }}>SKU & Producto Kit</th>
                <th style={{ padding: '0.85rem 1rem' }}>Estado Kit</th>
                <th style={{ padding: '0.85rem 1rem' }}>Precio Kit VTEX</th>
                <th style={{ padding: '0.85rem 1rem' }}>Suma Componentes</th>
                <th style={{ padding: '0.85rem 1rem' }}>Paridad de Precio</th>
                <th style={{ padding: '0.85rem 1rem' }}>Stock Armable Kit</th>
                <th style={{ padding: '0.85rem 1rem', textCenter: 'center' }}>Estatus Operativo</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} color="#38bdf8" />
                    <div style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                      Cargando datos de Kits y Componentes Mini Split desde VTEX...
                    </div>
                  </td>
                </tr>
              ) : filteredKits.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Info size={28} color="#94a3b8" />
                    <div style={{ marginTop: '0.5rem', fontSize: '0.95rem', fontWeight: 600 }}>
                      No se encontraron Kits Mini Split
                    </div>
                    <div style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>
                      Intenta cambiar los filtros de búsqueda o agrega un nuevo Kit SKU.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredKits.map((kit) => {
                  const isExpanded = expandedKits.has(kit.skuId);
                  const isDiffPositive = kit.priceDifference > 1;
                  const isDiffNegative = kit.priceDifference < -1;
                  const isToggling = togglingSkuId === kit.skuId;

                  return (
                    <div key={`group-${kit.skuId}`} style={{ display: 'contents' }}>
                      {/* FILA PRINCIPAL DEL KIT */}
                      <tr
                        onClick={() => toggleExpand(kit.skuId)}
                        style={{
                          borderBottom: isExpanded ? 'none' : '1px solid var(--border-subtle)',
                          background: isExpanded ? 'rgba(30, 41, 59, 0.4)' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                        }}
                        className="hover-row"
                      >
                        {/* TOGGLE CHEVRON */}
                        <td style={{ padding: '1rem 0.5rem 1rem 1rem', textAlign: 'center' }}>
                          {isExpanded ? (
                            <ChevronDown size={18} color="#38bdf8" />
                          ) : (
                            <ChevronRight size={18} color="var(--text-muted)" />
                          )}
                        </td>

                        {/* SKU & PRODUCTO KIT */}
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <img
                              src={kit.imageUrl || '/placeholder-product.svg'}
                              alt={kit.name}
                              style={{
                                width: '42px',
                                height: '42px',
                                objectFit: 'contain',
                                borderRadius: '8px',
                                background: '#ffffff',
                                padding: '2px',
                                border: '1px solid var(--border-subtle)',
                              }}
                              onError={(e) => {
                                e.target.src = '/placeholder-product.svg';
                              }}
                            />
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#ffffff' }}>
                                {kit.name}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                                <span
                                  style={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.78rem',
                                    color: '#38bdf8',
                                    background: 'rgba(56, 189, 248, 0.12)',
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(56, 189, 248, 0.25)',
                                  }}
                                >
                                  SKU Kit: {kit.skuId}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  ({kit.components.length} componentes)
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* ESTADO VTEX KIT CON BOTÓN TOGGLE ACTIVAR/DESACTIVAR */}
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            {kit.isActive ? (
                              <span
                                style={{
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '12px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  background: 'rgba(16, 185, 129, 0.15)',
                                  color: '#34d399',
                                }}
                              >
                                Activo
                              </span>
                            ) : (
                              <span
                                style={{
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '12px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  background: 'rgba(244, 63, 94, 0.15)',
                                  color: '#f43f5e',
                                }}
                              >
                                Inactivo
                              </span>
                            )}

                            <button
                              onClick={(e) => handleToggleActive(e, kit.skuId, !kit.isActive)}
                              disabled={isToggling}
                              style={{
                                padding: '0.2rem 0.45rem',
                                borderRadius: '6px',
                                border: kit.isActive ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid rgba(52, 211, 153, 0.3)',
                                background: kit.isActive ? 'rgba(244, 63, 94, 0.12)' : 'rgba(52, 211, 153, 0.12)',
                                color: kit.isActive ? '#f43f5e' : '#34d399',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: isToggling ? 'wait' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}
                              title={kit.isActive ? 'Desactivar Kit en VTEX Catalog' : 'Activar Kit en VTEX Catalog'}
                            >
                              <Power size={11} />
                              {isToggling ? '...' : kit.isActive ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </td>

                        {/* PRECIO KIT VTEX CON BOTÓN PARA EDITAR */}
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>
                              C$ {(kit.kitPrice.basePrice || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                            </div>
                            <button
                              onClick={(e) => openEditPriceModal(e, kit.skuId, kit.name, kit.kitPrice.basePrice, true)}
                              style={{
                                padding: '0.2rem 0.45rem',
                                borderRadius: '6px',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                background: 'rgba(56, 189, 248, 0.12)',
                                color: '#38bdf8',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}
                              title="Modificar precio base de este Kit en VTEX"
                            >
                              <Edit2 size={12} /> Editar
                            </button>
                          </div>
                          {kit.kitPrice.listPrice > kit.kitPrice.basePrice && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                              C$ {kit.kitPrice.listPrice.toLocaleString('es-NI')}
                            </div>
                          )}
                        </td>

                        {/* SUMA PRECIOS COMPONENTES */}
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#cbd5e1' }}>
                            C$ {(kit.componentsTotalPrice || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Suma indiv. componentes
                          </div>
                        </td>

                        {/* PARIDAD DE PRECIO */}
                        <td style={{ padding: '1rem' }}>
                          {isDiffPositive ? (
                            <span
                              style={{
                                padding: '0.3rem 0.65rem',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                background: 'rgba(168, 85, 247, 0.15)',
                                color: '#c084fc',
                                border: '1px solid rgba(168, 85, 247, 0.3)',
                                display: 'inline-block',
                              }}
                              title="El Kit es más económico que comprar los componentes por separado"
                            >
                              Kit ahorra C$ {Math.abs(kit.priceDifference).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                            </span>
                          ) : isDiffNegative ? (
                            <span
                              style={{
                                padding: '0.3rem 0.65rem',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: '#fbbf24',
                                border: '1px solid rgba(251, 191, 36, 0.3)',
                                display: 'inline-block',
                              }}
                              title="Los componentes por separado son más económicos que el Kit"
                            >
                              Comp. -C$ {Math.abs(kit.priceDifference).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Mismo Precio
                            </span>
                          )}
                        </td>

                        {/* STOCK ARMABLE KIT */}
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span
                              style={{
                                fontSize: '1.05rem',
                                fontWeight: 800,
                                color: kit.maxBuildableStock > 0 ? '#34d399' : '#f43f5e',
                              }}
                            >
                              {kit.maxBuildableStock}
                            </span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              kits armables
                            </span>
                          </div>
                        </td>

                        {/* ESTATUS OPERATIVO */}
                        <td style={{ padding: '1rem' }}>
                          {renderStatusBadge(kit.status)}
                        </td>
                      </tr>

                      {/* DESGLOSE EXPANDIDO DE COMPONENTES */}
                      {isExpanded && (
                        <tr style={{ background: 'rgba(15, 23, 42, 0.85)', borderBottom: '1px solid var(--border-subtle)' }}>
                          <td colSpan={8} style={{ padding: '1.25rem 1.5rem 1.25rem 3.5rem' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <Boxes size={16} /> COMPONENTES ASOCIADOS AL KIT ({kit.components.length})
                            </div>

                            {kit.components.length === 0 ? (
                              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', italic: true }}>
                                No se encontraron componentes registrados en VTEX para este Kit.
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                                  gap: '1rem',
                                }}
                              >
                                {kit.components.map((comp) => {
                                  const isCompToggling = togglingSkuId === comp.skuId;
                                  const isDisplayToggling = togglingDisplaySkuId === comp.skuId;

                                  return (
                                    <div
                                      key={comp.skuId}
                                      style={{
                                        background: 'rgba(30, 41, 59, 0.6)',
                                        borderRadius: '12px',
                                        border: comp.isActive ? '1px solid var(--border-subtle)' : '1px solid rgba(244, 63, 94, 0.4)',
                                        padding: '1rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.75rem',
                                      }}
                                    >
                                      {/* ILUSTRACIÓN Y DATOS DEL COMPONENTE CON SU PROPIA IMAGEN DE VTEX */}
                                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                        <img
                                          src={comp.imageUrl || '/placeholder-product.svg'}
                                          alt={comp.name}
                                          style={{
                                            width: '54px',
                                            height: '54px',
                                            objectFit: 'contain',
                                            borderRadius: '8px',
                                            background: '#ffffff',
                                            padding: '2px',
                                            border: '1px solid var(--border-subtle)',
                                          }}
                                          onError={(e) => { e.target.src = '/placeholder-product.svg'; }}
                                        />
                                        <div style={{ flex: 1 }}>
                                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ffffff' }}>
                                            {comp.name}
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                                            <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#a5b4fc' }}>
                                              SKU: {comp.skuId}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                              Cant: {comp.quantity}x
                                            </span>

                                            {/* BADGE Y BOTÓN TOGGLE ACTIVAR/DESACTIVAR COMPONENTE */}
                                            {comp.isActive ? (
                                              <span style={{ fontSize: '0.7rem', color: '#34d399', background: 'rgba(52, 211, 153, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                                Activo
                                              </span>
                                            ) : (
                                              <span style={{ fontSize: '0.7rem', color: '#f43f5e', background: 'rgba(244, 63, 94, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                                Inactivo VTEX
                                              </span>
                                            )}

                                            <button
                                              onClick={(e) => handleToggleActive(e, comp.skuId, !comp.isActive)}
                                              disabled={isCompToggling}
                                              style={{
                                                padding: '0.15rem 0.4rem',
                                                borderRadius: '4px',
                                                border: comp.isActive ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid rgba(52, 211, 153, 0.3)',
                                                background: comp.isActive ? 'rgba(244, 63, 94, 0.12)' : 'rgba(52, 211, 153, 0.12)',
                                                color: comp.isActive ? '#f43f5e' : '#34d399',
                                                fontSize: '0.68rem',
                                                fontWeight: 600,
                                                cursor: isCompToggling ? 'wait' : 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.2rem',
                                              }}
                                              title={comp.isActive ? 'Desactivar componente en VTEX Catalog' : 'Activar componente en VTEX Catalog'}
                                            >
                                              <Power size={10} />
                                              {isCompToggling ? '...' : comp.isActive ? 'Desactivar' : 'Activar'}
                                            </button>

                                            <span
                                              style={{
                                                fontSize: '0.7rem',
                                                color: comp.displayOnSite ? '#38bdf8' : '#94a3b8',
                                                background: comp.displayOnSite ? 'rgba(56, 189, 248, 0.12)' : 'rgba(148, 163, 184, 0.1)',
                                                padding: '0.1rem 0.4rem',
                                                borderRadius: '4px',
                                              }}
                                            >
                                              {comp.displayOnSite ? 'Visible web' : 'Oculto web'}
                                            </span>

                                            <button
                                              onClick={(e) => handleToggleDisplayOnSite(e, comp.skuId, !comp.displayOnSite)}
                                              disabled={isDisplayToggling}
                                              style={{
                                                padding: '0.15rem 0.4rem',
                                                borderRadius: '4px',
                                                border: comp.displayOnSite ? '1px solid rgba(251, 191, 36, 0.35)' : '1px solid rgba(56, 189, 248, 0.35)',
                                                background: comp.displayOnSite ? 'rgba(251, 191, 36, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                                                color: comp.displayOnSite ? '#fbbf24' : '#38bdf8',
                                                fontSize: '0.68rem',
                                                fontWeight: 600,
                                                cursor: isDisplayToggling ? 'wait' : 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.2rem',
                                              }}
                                              title={comp.displayOnSite ? 'Ocultar componente en website VTEX' : 'Mostrar componente en website VTEX'}
                                            >
                                              {comp.displayOnSite ? <EyeOff size={10} /> : <Eye size={10} />}
                                              {isDisplayToggling ? '...' : comp.displayOnSite ? 'Ocultar web' : 'Mostrar web'}
                                            </button>
                                          </div>
                                        </div>
                                      </div>

                                      {/* DETALLES DE PRECIO E INVENTARIO POR BODEGA CON BOTÓN DE EDITAR PRECIO DE COMPONENTE */}
                                      <div
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: '1fr 1fr 1fr',
                                          gap: '0.5rem',
                                          background: 'rgba(15, 23, 42, 0.5)',
                                          padding: '0.65rem 0.75rem',
                                          borderRadius: '8px',
                                          fontSize: '0.78rem',
                                        }}
                                      >
                                        <div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Precio Base</span>
                                            <button
                                              onClick={(e) => openEditPriceModal(e, comp.skuId, comp.name, comp.price.basePrice, false)}
                                              style={{
                                                padding: '0.15rem 0.35rem',
                                                borderRadius: '4px',
                                                border: '1px solid rgba(165, 180, 252, 0.3)',
                                                background: 'rgba(165, 180, 252, 0.15)',
                                                color: '#a5b4fc',
                                                fontSize: '0.68rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.2rem',
                                              }}
                                              title="Modificar precio base de este componente en VTEX"
                                            >
                                              <Edit2 size={10} /> Editar
                                            </button>
                                          </div>
                                          <div style={{ fontWeight: 700, color: '#ffffff', marginTop: '0.15rem' }}>
                                            C$ {(comp.price.basePrice || 0).toLocaleString('es-NI')}
                                          </div>
                                        </div>

                                        <div>
                                          <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Bodega 24 (WH1)</div>
                                          <div style={{ fontWeight: 700, color: comp.inventory.stockWh1 > 0 ? '#38bdf8' : '#f43f5e', marginTop: '0.15rem' }}>
                                            {comp.inventory.stockWh1 || 0} uds
                                          </div>
                                        </div>

                                        <div>
                                          <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Bodega 1041 (WH2)</div>
                                          <div style={{ fontWeight: 700, color: comp.inventory.stockWh2 > 0 ? '#a5b4fc' : '#f43f5e', marginTop: '0.15rem' }}>
                                            {comp.inventory.stockWh2 || 0} uds
                                          </div>
                                        </div>
                                      </div>

                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        <span>Stock Total Componente: <strong style={{ color: comp.inventory.totalStock > 0 ? '#34d399' : '#f43f5e' }}>{comp.inventory.totalStock || 0} uds</strong></span>
                                        <span>Reservado: {comp.inventory.totalReserved || 0}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </div>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PARA AGREGAR NUEVO KIT SKU */}
      {isAddModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '460px',
              background: '#0f172a',
              border: '1px solid var(--border-subtle)',
              borderRadius: '20px',
              padding: '1.75rem',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={20} color="#38bdf8" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Monitorear Nuevo Kit SKU
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSku} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  SKU ID del Kit en VTEX *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: 2025221407"
                  value={newSkuInput}
                  onChange={(e) => setNewSkuInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    background: 'rgba(30, 41, 59, 0.6)',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Descripción / Nota (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Mini Split LG 12000 BTU"
                  value={newSkuDesc}
                  onChange={(e) => setNewSkuDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    background: 'rgba(30, 41, 59, 0.6)',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>

              {addFeedback && (
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    background: addFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                    color: addFeedback.type === 'success' ? '#34d399' : '#f43f5e',
                    border: addFeedback.type === 'success' ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)',
                  }}
                >
                  {addFeedback.message}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{
                    flex: 1,
                    padding: '0.65rem',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={addingSku || !newSkuInput.trim()}
                  style={{
                    flex: 1,
                    padding: '0.65rem',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'var(--gradient-btn)',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: addingSku ? 'wait' : 'pointer',
                  }}
                >
                  {addingSku ? 'Registrando...' : 'Agregar Kit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PARA MODIFICAR PRECIO BASE DE SKU (KIT O COMPONENTE) */}
      {isPriceModalOpen && targetSkuToEdit && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '460px',
              background: '#0f172a',
              border: '1px solid var(--border-subtle)',
              borderRadius: '20px',
              padding: '1.75rem',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Tag size={20} color="#38bdf8" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Modificar Precio Base VTEX
                </h3>
              </div>
              <button
                onClick={() => setIsPriceModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdatePriceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.6)',
                  padding: '0.85rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {targetSkuToEdit.isKit ? 'SKU Kit Mini Split' : 'SKU Componente'}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#ffffff', marginTop: '0.1rem' }}>
                  {targetSkuToEdit.name}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#38bdf8', marginTop: '0.2rem' }}>
                  SKU: {targetSkuToEdit.skuId}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Nuevo Precio Base (C$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="Ej: 12599.00"
                  value={newPriceInput}
                  onChange={(e) => setNewPriceInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    background: 'rgba(30, 41, 59, 0.6)',
                    color: '#ffffff',
                    fontSize: '1rem',
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Precio base anterior: C$ {(targetSkuToEdit.currentPrice || 0).toLocaleString('es-NI')}
                </div>
              </div>

              {priceEditFeedback && (
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    background: priceEditFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                    color: priceEditFeedback.type === 'success' ? '#34d399' : '#f43f5e',
                    border: priceEditFeedback.type === 'success' ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  {priceEditFeedback.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
                  {priceEditFeedback.message}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsPriceModalOpen(false)}
                  style={{
                    flex: 1,
                    padding: '0.65rem',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={updatingPrice || !newPriceInput}
                  style={{
                    flex: 1,
                    padding: '0.65rem',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'var(--gradient-btn)',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: updatingPrice ? 'wait' : 'pointer',
                  }}
                >
                  {updatingPrice ? 'Actualizando en VTEX...' : 'Guardar en VTEX'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL PARA SUBIR ARCHIVO EXCEL DE KITS */}
      {isExcelModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#0f172a',
              border: '1px solid var(--border-subtle)',
              borderRadius: '20px',
              padding: '1.75rem',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileSpreadsheet size={22} color="#38bdf8" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Carga Masiva de Kits desde Excel
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsExcelModalOpen(false);
                  setExcelFeedback(null);
                  setExcelFile(null);
                  setParsedExcelItems([]);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                Sube tu exportación de VTEX en formato <strong>.xlsx</strong>, <strong>.xls</strong> o <strong>.csv</strong>. El sistema identificará automáticamente los SKUs y registrará únicamente los que no existan en Supabase.
              </p>

              <div
                style={{
                  border: '2px dashed #0284c7',
                  borderRadius: '14px',
                  padding: '1.5rem',
                  textAlign: 'center',
                  background: 'rgba(2, 132, 199, 0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleExcelFileChange}
                  id="excel-file-input"
                  style={{ display: 'none' }}
                />
                <label htmlFor="excel-file-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <Upload size={32} color="#38bdf8" />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff' }}>
                    {excelFile ? excelFile.name : 'Haz clic para seleccionar o arrastra tu archivo Excel'}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Formatos soportados: .xlsx, .xls, .csv
                  </span>
                </label>
              </div>

              {parsingExcel && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#38bdf8', fontSize: '0.85rem' }}>
                  <RefreshCw size={16} className="spin" /> Leyendo y procesando archivo Excel...
                </div>
              )}

              {excelFeedback && (
                <div
                  style={{
                    padding: '0.85rem',
                    borderRadius: '10px',
                    fontSize: '0.85rem',
                    background:
                      excelFeedback.type === 'success'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : excelFeedback.type === 'info'
                        ? 'rgba(56, 189, 248, 0.15)'
                        : 'rgba(244, 63, 94, 0.15)',
                    color:
                      excelFeedback.type === 'success'
                        ? '#34d399'
                        : excelFeedback.type === 'info'
                        ? '#38bdf8'
                        : '#f43f5e',
                    border:
                      excelFeedback.type === 'success'
                        ? '1px solid rgba(52, 211, 153, 0.3)'
                        : excelFeedback.type === 'info'
                        ? '1px solid rgba(56, 189, 248, 0.3)'
                        : '1px solid rgba(244, 63, 94, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  {excelFeedback.type === 'success' ? (
                    <Check size={18} />
                  ) : excelFeedback.type === 'info' ? (
                    <Info size={18} />
                  ) : (
                    <AlertTriangle size={18} />
                  )}
                  <div>{excelFeedback.message}</div>
                </div>
              )}

              {parsedExcelItems.length > 0 && (
                <div
                  style={{
                    maxHeight: '140px',
                    overflowY: 'auto',
                    background: 'rgba(30, 41, 59, 0.5)',
                    borderRadius: '10px',
                    padding: '0.75rem',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.78rem',
                  }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                    Vista previa de SKUs detectados ({parsedExcelItems.length}):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {parsedExcelItems.slice(0, 30).map((item, idx) => (
                      <span
                        key={idx}
                        style={{
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          fontFamily: 'monospace',
                        }}
                      >
                        {item.skuId}
                      </span>
                    ))}
                    {parsedExcelItems.length > 30 && (
                      <span style={{ color: 'var(--text-muted)', padding: '0.2rem 0.5rem' }}>
                        ...y {parsedExcelItems.length - 30} más
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsExcelModalOpen(false);
                    setExcelFeedback(null);
                    setExcelFile(null);
                    setParsedExcelItems([]);
                  }}
                  style={{
                    flex: 1,
                    padding: '0.7rem',
                    borderRadius: '10px',
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSubmitExcelImport}
                  disabled={importingExcel || parsedExcelItems.length === 0}
                  style={{
                    flex: 1,
                    padding: '0.7rem',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: importingExcel || parsedExcelItems.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: parsedExcelItems.length === 0 ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                  }}
                >
                  {importingExcel ? (
                    <>
                      <RefreshCw size={16} className="spin" /> Guardando en Supabase...
                    </>
                  ) : (
                    `Importar ${parsedExcelItems.length > 0 ? parsedExcelItems.length : ''} SKUs a Supabase`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
