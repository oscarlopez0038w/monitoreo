'use client';

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Sparkles,
  Search,
  Upload,
  Download,
  Save,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  Tag,
  Layers,
  ShoppingBag,
  TrendingUp,
  Percent,
  Zap,
  ArrowUpDown,
  Filter,
  Check,
  Plus,
  Loader2,
  FolderPlus,
} from 'lucide-react';

export default function HomeShowcasesPanel() {
  const [rawInput, setRawInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [enrichedData, setEnrichedData] = useState(null);
  const [selectedSkuIds, setSelectedSkuIds] = useState(new Set());
  
  // Filtros y ordenamiento
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [discountFilter, setDiscountFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('attractivenessScore'); // 'attractivenessScore', 'discountPct', 'basePriceAsc', 'basePriceDesc', 'stock'
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [priceRangeMode, setPriceRangeMode] = useState('prioritize'); // 'prioritize', 'strict'
  
  // Guardado de Vitrinas
  const [savedShowcases, setSavedShowcases] = useState([]);
  const [loadingShowcases, setLoadingShowcases] = useState(true);
  const [showcaseTitle, setShowcaseTitle] = useState('');
  const [showcaseDescription, setShowcaseDescription] = useState('');
  const [selectedShowcaseId, setSelectedShowcaseId] = useState(null);
  const [banner, setBanner] = useState(null);
  const [activeTab, setActiveTab] = useState('curator'); // 'curator', 'preview', 'saved'

  // Cargar vitrinas guardadas al iniciar
  const fetchSavedShowcases = async () => {
    setLoadingShowcases(true);
    try {
      const res = await fetch('/api/showcases');
      const data = await res.json();
      if (data.success) {
        setSavedShowcases(data.showcases || []);
      }
    } catch (e) {
      console.error('Error cargando vitrinas:', e);
    } finally {
      setLoadingShowcases(false);
    }
  };

  useEffect(() => {
    fetchSavedShowcases();
  }, []);

  // Procesar e ingresar SKUs
  const handleAnalyzeSkus = async (textToProcess = null) => {
    const text = textToProcess !== null ? textToProcess : rawInput;
    if (!text || !text.trim()) {
      setBanner({ type: 'error', text: 'Por favor ingresa o pega una lista de SKUs para analizar.' });
      return;
    }

    setLoading(true);
    setBanner(null);

    try {
      const res = await fetch('/api/showcases/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text }),
      });

      const data = await res.json();

      if (data.success && Array.isArray(data.items)) {
        setEnrichedData(data);
        // Seleccionar todos por defecto
        const allIds = new Set(data.items.map((i) => i.id));
        setSelectedSkuIds(allIds);
        setBanner({
          type: 'success',
          text: `🎉 ¡${data.items.length} SKUs analizados y enriquecidos con éxito!`,
        });
      } else {
        setBanner({ type: 'error', text: data.error || 'Error analizando SKUs.' });
      }
    } catch (err) {
      setBanner({ type: 'error', text: `Error de red: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Cargar SKUs desde archivo Excel/CSV/TXT
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      if (typeof content === 'string') {
        setRawInput(content);
        handleAnalyzeSkus(content);
      } else {
        // Tratar como buffer Excel/CSV si aplica
        const workbook = XLSX.read(content, { type: 'binary' });
        const firstSheet = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheet];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const extracted = json.flat().join('\n');
        setRawInput(extracted);
        handleAnalyzeSkus(extracted);
      }
    };

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsText(file);
    }
  };

  // Botón rápido de prueba de SKUs populares con descuento desde la API
  const handleLoadSampleSkus = async () => {
    setLoading(true);
    setBanner({ type: 'info', text: '⚡ Consultando SKUs con mayores ofertas desde Supabase...' });
    try {
      const res = await fetch('/api/prices?sortBy=discount_pct&sortOrder=desc&pageSize=30');
      const data = await res.json();
      if (data.success && Array.isArray(data.skus)) {
        const idsList = data.skus.map((s) => s.id).join('\n');
        setRawInput(idsList);
        await handleAnalyzeSkus(idsList);
      }
    } catch (e) {
      setBanner({ type: 'error', text: 'Error cargando SKUs de prueba.' });
    } finally {
      setLoading(false);
    }
  };

  // Filtrado y ordenamiento de ítems enriquecidos
  const filteredItems = useMemo(() => {
    if (!enrichedData || !Array.isArray(enrichedData.items)) return [];

    let list = [...enrichedData.items];

    // Buscador por nombre o SKU
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          String(item.id).includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
      );
    }

    // Filtro por categoría
    if (categoryFilter !== 'all') {
      list = list.filter((item) => item.category === categoryFilter);
    }

    // Filtro por descuento y stock
    if (discountFilter === 'gt20') {
      list = list.filter((item) => item.discountPct >= 20);
    } else if (discountFilter === 'gt10') {
      list = list.filter((item) => item.discountPct >= 10);
    } else if (discountFilter === 'with_discount') {
      list = list.filter((item) => item.discountPct > 0);
    } else if (discountFilter === 'with_stock') {
      list = list.filter((item) => item.stock > 0);
    } else if (discountFilter === 'no_discount') {
      list = list.filter((item) => item.discountPct === 0);
    }

    // Rango de precio personalizado
    const minP = minPriceInput !== '' && !isNaN(minPriceInput) ? parseFloat(minPriceInput) : null;
    const maxP = maxPriceInput !== '' && !isNaN(maxPriceInput) ? parseFloat(maxPriceInput) : null;

    const isInPriceRange = (price) => {
      if (price === null || price === undefined) return false;
      if (minP !== null && price < minP) return false;
      if (maxP !== null && price > maxP) return false;
      return true;
    };

    const hasPriceRange = minP !== null || maxP !== null;

    // Modo filtro estricto de precio
    if (hasPriceRange && priceRangeMode === 'strict') {
      list = list.filter((item) => isInPriceRange(item.basePrice));
    }

    // Ordenamiento jerárquico:
    // 1. Productos con STOCK (> 0) siempre primero; productos sin stock (0) al final.
    // 2. Si hay Rango de Precio Preferido (modo priorizar): productos dentro del rango primero, fuera del rango después.
    // 3. Criterio de ordenamiento seleccionado (Atractivo Comercial, Descuento %, Precio Venta, etc.).
    list.sort((a, b) => {
      const aHasStock = a.stock > 0 ? 1 : 0;
      const bHasStock = b.stock > 0 ? 1 : 0;
      if (aHasStock !== bHasStock) {
        return bHasStock - aHasStock;
      }

      if (hasPriceRange && priceRangeMode === 'prioritize') {
        const aInRange = isInPriceRange(a.basePrice) ? 1 : 0;
        const bInRange = isInPriceRange(b.basePrice) ? 1 : 0;
        if (aInRange !== bInRange) {
          return bInRange - aInRange;
        }
      }

      if (sortBy === 'attractivenessScore') {
        return b.attractivenessScore - a.attractivenessScore;
      }
      if (sortBy === 'discountPct') {
        return b.discountPct - a.discountPct;
      }
      if (sortBy === 'basePriceAsc') {
        return (a.basePrice || 0) - (b.basePrice || 0);
      }
      if (sortBy === 'basePriceDesc') {
        return (b.basePrice || 0) - (a.basePrice || 0);
      }
      if (sortBy === 'stock') {
        return b.stock - a.stock;
      }
      return 0;
    });

    return list;
  }, [enrichedData, searchQuery, categoryFilter, discountFilter, sortBy, minPriceInput, maxPriceInput, priceRangeMode]);

  // Selección individual / masiva
  const toggleSelectAll = () => {
    if (selectedSkuIds.size === filteredItems.length) {
      setSelectedSkuIds(new Set());
    } else {
      setSelectedSkuIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const toggleSelectSku = (skuId) => {
    const next = new Set(selectedSkuIds);
    if (next.has(skuId)) {
      next.delete(skuId);
    } else {
      next.add(skuId);
    }
    setSelectedSkuIds(next);
  };

  // Ítems actualmente seleccionados para la vitrina (respetando el ordenamiento y filtrado de curaduría)
  const selectedItems = useMemo(() => {
    if (!filteredItems) return [];
    return filteredItems.filter((item) => selectedSkuIds.has(item.id));
  }, [filteredItems, selectedSkuIds]);

  // Guardar Vitrina en Supabase
  const handleSaveShowcase = async () => {
    if (!showcaseTitle.trim()) {
      setBanner({ type: 'error', text: 'Ingresa un nombre o título para la vitrina.' });
      return;
    }
    if (selectedItems.length === 0) {
      setBanner({ type: 'error', text: 'Selecciona al menos un producto para la vitrina.' });
      return;
    }

    setSaving(true);
    setBanner(null);

    // Obtener categoría dominante
    const catCounts = {};
    selectedItems.forEach((i) => {
      catCounts[i.category] = (catCounts[i.category] || 0) + 1;
    });
    let topCat = 'General';
    let maxCount = 0;
    Object.entries(catCounts).forEach(([cat, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topCat = cat;
      }
    });

    try {
      const res = await fetch('/api/showcases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedShowcaseId,
          title: showcaseTitle,
          description: showcaseDescription,
          categoryFocus: topCat,
          items: selectedItems,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setBanner({ type: 'success', text: `✨ ${data.message}` });
        fetchSavedShowcases();
        setShowcaseTitle('');
        setShowcaseDescription('');
        setSelectedShowcaseId(null);
      } else {
        setBanner({ type: 'error', text: data.error || 'Error al guardar la vitrina.' });
      }
    } catch (err) {
      setBanner({ type: 'error', text: `Error de red: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  // Cargar una vitrina guardada
  const handleLoadSavedShowcase = (showcase) => {
    setSelectedShowcaseId(showcase.id);
    setShowcaseTitle(showcase.title || '');
    setShowcaseDescription(showcase.description || '');

    const items = showcase.items || [];
    setEnrichedData({
      items,
      count: items.length,
      metrics: {
        totalSkus: items.length,
        withDiscountCount: items.filter((i) => i.discountPct > 0).length,
        avgDiscountPct: items.length > 0 ? parseFloat((items.reduce((a, b) => a + b.discountPct, 0) / items.length).toFixed(1)) : 0,
        maxDiscountPct: items.reduce((m, i) => Math.max(m, i.discountPct), 0),
        totalStockSum: items.reduce((a, b) => a + b.stock, 0),
      },
    });

    setSelectedSkuIds(new Set(items.map((i) => i.id)));
    setActiveTab('curator');
    setBanner({ type: 'success', text: `📂 Vitrina "${showcase.title}" cargada exitosamente.` });
  };

  // Eliminar una vitrina guardada
  const handleDeleteShowcase = async (id, title) => {
    if (!confirm(`¿Estás seguro de eliminar la vitrina "${title}"?`)) return;

    try {
      const res = await fetch(`/api/showcases?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setBanner({ type: 'success', text: `🗑️ Vitrina "${title}" eliminada.` });
        fetchSavedShowcases();
      } else {
        setBanner({ type: 'error', text: data.error || 'Error al eliminar.' });
      }
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  // Exportar Vitrina a Excel (.xlsx)
  const handleExportExcel = () => {
    if (selectedItems.length === 0) {
      alert('Selecciona al menos un producto para exportar.');
      return;
    }

    setExporting(true);
    try {
      const rows = selectedItems.map((item) => ({
        'SKU ID': item.id,
        'Nombre / Descripción': item.description,
        'Categoría': item.category,
        'Marca': item.brand,
        'Precio Lista MSRP (C$)': item.listPrice !== null ? item.listPrice : 'N/A',
        'Precio Base Venta (C$)': item.basePrice !== null ? item.basePrice : 'N/A',
        'Monto Descuento (C$)': item.discountAmount,
        'Porcentaje Descuento (%)': `${item.discountPct}%`,
        'Stock Disponible': item.stock,
        'Atractivo Comercial (0-100)': item.attractivenessScore,
        'Estado': item.isActive ? 'Activo' : 'Inactivo',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Vitrina Home SINSA');

      worksheet['!cols'] = [
        { wch: 15 },
        { wch: 45 },
        { wch: 22 },
        { wch: 18 },
        { wch: 22 },
        { wch: 22 },
        { wch: 22 },
        { wch: 22 },
        { wch: 18 },
        { wch: 24 },
        { wch: 12 },
      ];

      const fileName = `Vitrina_Home_SINSA_${showcaseTitle ? showcaseTitle.replace(/\s+/g, '_') : 'Destacados'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      setBanner({ type: 'success', text: `📊 Reporte exportado a Excel: ${fileName}` });
    } catch (e) {
      alert('Error exportando Excel: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  // Obtener lista de categorías únicas detectadas
  const availableCategories = useMemo(() => {
    if (!enrichedData || !Array.isArray(enrichedData.items)) return [];
    const setCats = new Set(enrichedData.items.map((i) => i.category));
    return Array.from(setCats).sort();
  }, [enrichedData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Banner de Notificación */}
      {banner && (
        <div
          style={{
            padding: '0.85rem 1.15rem',
            borderRadius: '12px',
            fontSize: '0.86rem',
            background:
              banner.type === 'success'
                ? 'rgba(52, 211, 153, 0.12)'
                : banner.type === 'info'
                ? 'rgba(56, 189, 248, 0.12)'
                : 'rgba(248, 113, 113, 0.12)',
            border: `1px solid ${
              banner.type === 'success'
                ? 'rgba(52, 211, 153, 0.3)'
                : banner.type === 'info'
                ? 'rgba(56, 189, 248, 0.3)'
                : 'rgba(248, 113, 113, 0.3)'
            }`,
            color:
              banner.type === 'success'
                ? '#34d399'
                : banner.type === 'info'
                ? '#38bdf8'
                : '#fb7185',
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
          }}
        >
          <span>{banner.text}</span>
        </div>
      )}

      {/* Header Principal del Módulo */}
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Sparkles size={22} color="#38bdf8" />
            Módulo de Vitrinas Destacadas Home & Aumento de Ventas
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Ingresa un listado de SKUs para analizarlos, agruparlos por categoría, evaluar sus precios y ofertas, y armar vitrinas atractivas para el Home de la web.
          </p>
        </div>

        {/* Tab Navigation Controls */}
        <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.7)', padding: '0.3rem', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setActiveTab('curator')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === 'curator' ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === 'curator' ? '#ffffff' : 'var(--text-muted)',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease',
            }}
          >
            <Sparkles size={15} /> 1. Estudio de Curaduría
          </button>

          <button
            onClick={() => setActiveTab('preview')}
            disabled={!enrichedData}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === 'preview' ? '#10b981' : 'transparent',
              color: activeTab === 'preview' ? '#ffffff' : enrichedData ? 'var(--text-muted)' : 'rgba(255,255,255,0.2)',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: enrichedData ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease',
            }}
          >
            <Eye size={15} /> 2. Vista Previa Home E-Commerce ({selectedItems.length})
          </button>

          <button
            onClick={() => setActiveTab('saved')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === 'saved' ? '#8b5cf6' : 'transparent',
              color: activeTab === 'saved' ? '#ffffff' : 'var(--text-muted)',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease',
            }}
          >
            <FolderPlus size={15} /> Vitrinas Guardadas ({savedShowcases.length})
          </button>
        </div>
      </div>

      {/* TAB 1: CURADOR DE PRODUCTOS & INGRESO DE SKUs */}
      {activeTab === 'curator' && (
        <>
          {/* 1. Panel de Carga / Pegado de SKUs */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={18} color="#38bdf8" />
              Paso 1: Cargar o Pegar Listado de SKUs
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.25rem' }}>
              <div>
                <textarea
                  className="glass-input"
                  rows={4}
                  style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', resize: 'vertical' }}
                  placeholder="Pega aquí tu lista de SKUs (ej: 7694827, 100952826, 147675336... separados por comas o saltos de línea)"
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', justifyContent: 'center' }}>
                <label
                  style={{
                    padding: '0.65rem 1rem',
                    borderRadius: '10px',
                    border: '1px dashed rgba(56, 189, 248, 0.4)',
                    background: 'rgba(56, 189, 248, 0.08)',
                    color: '#38bdf8',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    textAlign: 'center',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Upload size={16} /> Subir Excel / CSV / TXT
                  <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>

                <button
                  onClick={() => handleAnalyzeSkus()}
                  disabled={loading || !rawInput.trim()}
                  className="btn-primary"
                  style={{ padding: '0.65rem 1.15rem', fontSize: '0.88rem' }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {loading ? 'Analizando SKUs...' : 'Analizar & Enriquecer Productos'}
                </button>
              </div>
            </div>
          </div>

          {/* 2. Resumen Estadístico & Métricas de Atractivo Comercial */}
          {enrichedData && (
            <div className="glass-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
                    TOTAL SKUS ANALIZADOS
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    {enrichedData.metrics.totalSkus}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedItems.length} seleccionados</span>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
                    SKUS CON OFERTA %
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                    {enrichedData.metrics.withDiscountCount}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#34d399' }}>
                    Max: -{enrichedData.metrics.maxDiscountPct}% | Prom: -{enrichedData.metrics.avgDiscountPct}%
                  </span>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
                    CATEGORÍAS DETECTADAS
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#e879f9', fontFamily: 'var(--font-mono)' }}>
                    {availableCategories.length}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Clasificación automática</span>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem' }}>
                    STOCK TOTAL EN VITRINA
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                    {enrichedData.metrics.totalStockSum.toLocaleString('es-NI')}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Unidades disponibles</span>
                </div>

              </div>
            </div>
          )}

          {/* 3. Filtros, Búsqueda y Tabla Inteligente de Curaduría */}
          {enrichedData && (
            <div className="glass-card" style={{ padding: '1.25rem' }}>
              
              {/* Controles de Filtro */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff' }}>
                    Productos Enriquecidos ({filteredItems.length})
                  </h3>

                  <button
                    onClick={toggleSelectAll}
                    className="btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                  >
                    {selectedSkuIds.size === filteredItems.length ? 'Desseleccionar Todos' : 'Seleccionar Todos'}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                  
                  {/* Buscador interno */}
                  <div style={{ position: 'relative', minWidth: '180px' }}>
                    <Search size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      className="glass-input"
                      style={{ width: '100%', paddingLeft: '2.1rem', fontSize: '0.8rem' }}
                      placeholder="Buscar por nombre o SKU..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {/* Barra de Filtro de Rango de Precio Personalizado */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(15, 23, 42, 0.8)', padding: '0.35rem 0.75rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      💰 Rango Precio Objetivo (C$):
                    </span>

                    <input
                      type="number"
                      className="glass-input"
                      style={{ width: '90px', padding: '0.25rem 0.5rem', fontSize: '0.78rem' }}
                      placeholder="Mín C$"
                      value={minPriceInput}
                      onChange={(e) => setMinPriceInput(e.target.value)}
                    />

                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>a</span>

                    <input
                      type="number"
                      className="glass-input"
                      style={{ width: '90px', padding: '0.25rem 0.5rem', fontSize: '0.78rem' }}
                      placeholder="Máx C$"
                      value={maxPriceInput}
                      onChange={(e) => setMaxPriceInput(e.target.value)}
                    />

                    <select
                      className="glass-input"
                      style={{ fontSize: '0.76rem', padding: '0.25rem 0.5rem', color: '#38bdf8', fontWeight: 600 }}
                      value={priceRangeMode}
                      onChange={(e) => setPriceRangeMode(e.target.value)}
                    >
                      <option value="prioritize">⭐ Priorizar Rango en Top (Primero, luego los demás)</option>
                      <option value="strict">🎯 Filtrar Estrictamente (Solo dentro del Rango)</option>
                    </select>

                    {(minPriceInput !== '' || maxPriceInput !== '') && (
                      <button
                        onClick={() => { setMinPriceInput(''); setMaxPriceInput(''); }}
                        style={{ background: 'transparent', border: 'none', color: '#fb7185', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 700, padding: '0 0.25rem' }}
                        title="Limpiar rango de precio"
                      >
                        ✕ Limpiar
                      </button>
                    )}
                  </div>

                  {/* Filtro por Categoría */}
                  <select
                    className="glass-input"
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem' }}
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="all">Todas las Categorías ({availableCategories.length})</option>
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  {/* Filtro por Nivel de Oferta */}
                  <select
                    className="glass-input"
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem' }}
                    value={discountFilter}
                    onChange={(e) => setDiscountFilter(e.target.value)}
                  >
                    <option value="all">Todas las Ofertas</option>
                    <option value="with_stock">📦 Solo con Stock Disponible (&gt; 0)</option>
                    <option value="gt20">Grandes Ofertas (&gt; 20%)</option>
                    <option value="gt10">Ofertas Moderadas (&gt; 10%)</option>
                    <option value="with_discount">Solo con Descuento</option>
                    <option value="no_discount">Sin Descuento</option>
                  </select>

                  {/* Criterio de Ordenamiento */}
                  <select
                    className="glass-input"
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem', color: '#38bdf8', fontWeight: 600 }}
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="attractivenessScore">⭐ Atractivo Comercial (Rating)</option>
                    <option value="discountPct">🔥 Mayor Descuento %</option>
                    <option value="basePriceAsc">💵 Precio Venta: Menor a Mayor</option>
                    <option value="basePriceDesc">💎 Precio Venta: Mayor a Menor</option>
                    <option value="stock">📦 Mayor Stock Disponible</option>
                  </select>

                </div>
              </div>

              {/* Tabla de Productos */}
              <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-subtle)', width: '100%' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', width: '40px' }}>Incluir</th>
                      <th style={{ padding: '0.6rem 0.75rem' }}>SKU ID</th>
                      <th style={{ padding: '0.6rem 0.75rem' }}>Producto / Descripción</th>
                      <th style={{ padding: '0.6rem 0.75rem' }}>Categoría</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>Precio Lista (MSRP)</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>Precio Venta (Base)</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Descuento %</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Stock</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Atractivo Commercial</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No hay productos que coincidan con los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => {
                        const isSelected = selectedSkuIds.has(item.id);

                        return (
                          <tr
                            key={item.id}
                            style={{
                              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                              background: isSelected ? 'rgba(56, 189, 248, 0.05)' : 'transparent',
                              transition: 'background 0.15s ease',
                            }}
                            className="hover-row"
                          >
                            {/* Checkbox Selección */}
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectSku(item.id)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                              />
                            </td>

                            {/* SKU ID */}
                            <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-primary)' }}>
                              {item.id}
                            </td>

                            {/* Descripción */}
                            <td style={{ padding: '0.6rem 0.75rem', color: '#ffffff', fontWeight: 500, maxWidth: '280px' }}>
                              {item.description}
                            </td>

                            {/* Categoría Badge */}
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                              <span style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px', padding: '0.15rem 0.45rem', fontSize: '0.72rem', fontWeight: 600 }}>
                                {item.category}
                              </span>
                            </td>

                            {/* Precio Lista */}
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: item.discountPct > 0 ? 'var(--text-dim)' : 'var(--text-muted)', textDecoration: item.discountPct > 0 ? 'line-through' : 'none' }}>
                              {item.listPrice !== null ? `C$ ${item.listPrice.toLocaleString('es-NI', { minimumFractionDigits: 2 })}` : '—'}
                            </td>

                            {/* Precio Base / Venta */}
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#34d399', fontSize: '0.85rem' }}>
                              {item.basePrice !== null ? `C$ ${item.basePrice.toLocaleString('es-NI', { minimumFractionDigits: 2 })}` : '—'}
                            </td>

                            {/* Descuento Badge */}
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                              {item.discountPct > 0 ? (
                                <span className="badge badge-emerald" style={{ padding: '0.2rem 0.5rem', fontSize: '0.74rem', fontWeight: 700 }}>
                                  -{item.discountPct}%
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>—</span>
                              )}
                            </td>

                            {/* Stock */}
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600, color: item.stock > 0 ? '#ffffff' : '#fb7185' }}>
                              {item.stock.toLocaleString('es-NI')}
                            </td>

                            {/* Rating Atractivo Comercial */}
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                                <div style={{ width: '50px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{ width: `${item.attractivenessScore}%`, height: '100%', background: item.attractivenessScore >= 70 ? '#34d399' : item.attractivenessScore >= 40 ? '#38bdf8' : '#fbbf24' }} />
                                </div>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ffffff' }}>{item.attractivenessScore}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Botones de Guardado y Exportación */}
              <div style={{ marginTop: '1.25rem', padding: '1.25rem', background: 'rgba(15, 23, 42, 0.7)', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="Título de la Vitrina (ej: Ofertas Destacadas Agosto, Baterías & Iluminación...)"
                    value={showcaseTitle}
                    onChange={(e) => setShowcaseTitle(e.target.value)}
                    style={{ flex: 1, fontSize: '0.84rem' }}
                  />
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="Descripción u objetivo (opcional)"
                    value={showcaseDescription}
                    onChange={(e) => setShowcaseDescription(e.target.value)}
                    style={{ flex: 1, fontSize: '0.84rem' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.65rem' }}>
                  <button
                    onClick={handleExportExcel}
                    disabled={exporting || selectedItems.length === 0}
                    style={{
                      padding: '0.55rem 1.1rem',
                      borderRadius: '10px',
                      border: '1px solid rgba(52, 211, 153, 0.4)',
                      background: 'rgba(52, 211, 153, 0.14)',
                      color: '#34d399',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      cursor: selectedItems.length === 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <Download size={16} /> Exportar Excel ({selectedItems.length})
                  </button>

                  <button
                    onClick={handleSaveShowcase}
                    disabled={saving || selectedItems.length === 0}
                    className="btn-primary"
                    style={{ padding: '0.55rem 1.25rem', fontSize: '0.84rem' }}
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {saving ? 'Guardando...' : selectedShowcaseId ? 'Actualizar Vitrina' : 'Guardar Vitrina en BD'}
                  </button>
                </div>
              </div>

            </div>
          )}
        </>
      )}

      {/* TAB 2: VISTA PREVIA SIMULADOR HOME E-COMMERCE */}
      {activeTab === 'preview' && (
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Eye size={20} color="#10b981" />
                Simulador de Vitrina Destacada en Home E-Commerce
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Esta es la representación visual exacta de los {selectedItems.length} productos seleccionados para el carrusel principal del sitio web.
              </p>
            </div>

            <button
              onClick={handleExportExcel}
              style={{
                padding: '0.55rem 1.1rem',
                borderRadius: '10px',
                border: '1px solid rgba(52, 211, 153, 0.4)',
                background: 'rgba(52, 211, 153, 0.14)',
                color: '#34d399',
                fontSize: '0.84rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Download size={16} /> Descargar Reporte Excel
            </button>
          </div>

          {/* E-Commerce Showcase Grid Preview */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {selectedItems.map((item) => (
              <div
                key={item.id}
                style={{
                  background: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '16px',
                  padding: '1.1rem',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justify: 'space-between',
                  boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)',
                  transition: 'all 0.25 ease',
                }}
              >
                {/* Badge Oferta Destello */}
                {item.discountPct > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '12px',
                      left: '12px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '8px',
                      boxShadow: '0 4px 10px rgba(16, 185, 129, 0.4)',
                      zIndex: 2,
                    }}
                  >
                    -{item.discountPct}% OFERTA
                  </span>
                )}

                {/* Categoría Tag */}
                <div style={{ textAlign: 'right', fontSize: '0.68rem', color: '#a78bfa', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>
                  {item.category}
                </div>

                {/* Foto / Icono Producto */}
                <div style={{ width: '100%', height: '120px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.85rem', overflow: 'hidden' }}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.description} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                  ) : (
                    <ShoppingBag size={38} color="rgba(255, 255, 255, 0.2)" />
                  )}
                </div>

                {/* Info Producto */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    SKU: {item.id}
                  </div>
                  <h4 style={{ fontSize: '0.84rem', fontWeight: 600, color: '#ffffff', lineHeight: 1.35, height: '2.7em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.description}
                  </h4>

                  {/* Contenedor de Precios */}
                  <div style={{ marginTop: 'auto', pt: '0.5rem' }}>
                    {item.discountPct > 0 && item.listPrice !== null && (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', textDecoration: 'line-through', fontFamily: 'var(--font-mono)' }}>
                        C$ {item.listPrice.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </div>
                    )}

                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                      C$ {(item.basePrice || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  {/* Stock Indicator */}
                  <div style={{ fontSize: '0.72rem', color: item.stock > 0 ? '#38bdf8' : '#fb7185', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.stock > 0 ? '#38bdf8' : '#fb7185' }} />
                    {item.stock > 0 ? `${item.stock} unidades en stock` : 'Sin stock'}
                  </div>
                </div>

                {/* Botón Simulado Comprar */}
                <button
                  style={{
                    marginTop: '0.85rem',
                    width: '100%',
                    padding: '0.45rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--accent-primary)',
                    color: '#ffffff',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'default',
                  }}
                >
                  🛒 Ver Producto en Web
                </button>

              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: VITRINAS GUARDADAS */}
      {activeTab === 'saved' && (
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderPlus size={20} color="#8b5cf6" />
            Vitrinas Destacadas Guardadas en Supabase
          </h3>

          {loadingShowcases ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={20} className="animate-spin" color="var(--accent-primary)" style={{ margin: '0 auto 0.5rem auto' }} />
              Cargando vitrinas guardadas...
            </div>
          ) : savedShowcases.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No hay vitrinas guardadas aún. Usa el **Paso 1** para curar productos y guardarlos.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {savedShowcases.map((sc) => (
                <div
                  key={sc.id}
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '14px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px', padding: '0.15rem 0.45rem', fontSize: '0.72rem', fontWeight: 600 }}>
                        {sc.category_focus || 'General'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        {new Date(sc.created_at).toLocaleDateString('es-NI')}
                      </span>
                    </div>

                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.3rem' }}>
                      {sc.title}
                    </h4>

                    {sc.description && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                        {sc.description}
                      </p>
                    )}

                    <div style={{ fontSize: '0.78rem', color: '#38bdf8', fontWeight: 600 }}>
                      📦 {sc.skus_count || (sc.items || []).length} SKUs incluidos
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      onClick={() => handleLoadSavedShowcase(sc)}
                      className="btn-primary"
                      style={{ flex: 1, fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
                    >
                      📂 Cargar & Editar
                    </button>

                    <button
                      onClick={() => handleDeleteShowcase(sc.id, sc.title)}
                      className="btn-secondary"
                      style={{ padding: '0.4rem 0.65rem', color: '#fb7185', borderColor: 'rgba(251, 113, 133, 0.3)' }}
                      title="Eliminar vitrina"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
