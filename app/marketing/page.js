'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  Download,
  Search,
  Copy,
  Check,
  ExternalLink,
  Image as ImageIcon,
  FileSpreadsheet,
  RefreshCw,
  Sparkles,
  Layers,
  ShoppingBag,
  Tag,
  Grid,
  List,
  Percent,
  CheckCircle2,
  FileText,
  Bookmark,
} from 'lucide-react';

export default function MarketingPublitasPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [batchSkus, setBatchSkus] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [imageFilter, setImageFilter] = useState('all');
  const [onlyDiscounts, setOnlyDiscounts] = useState(false);
  const [activeTab, setActiveTab] = useState('publitas'); // 'publitas' | 'catalog' | 'batch'
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [copiedKey, setCopiedKey] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [expandedDescId, setExpandedDescId] = useState(null);

  const fetchCatalogData = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = activeTab === 'publitas' ? '/api/catalog/publitas' : '/api/catalog/export';
      const params = new URLSearchParams({
        page: String(page),
        limit: '24',
        search,
        status: statusFilter,
        hasImage: imageFilter,
        onlyDiscounts: String(onlyDiscounts),
      });

      if (activeTab === 'batch' && batchSkus.trim()) {
        params.set('batchSkus', batchSkus.trim());
      }

      const res = await fetch(`${endpoint}?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setItems(data.items || data.products || []);
        setTotalPages(data.totalPages || 1);
        setTotalCount(data.total || 0);
      } else {
        alert(`Error al cargar datos de catálogo: ${data.error}`);
      }
    } catch (err) {
      console.error('Error fetching catalog data:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, batchSkus, statusFilter, imageFilter, onlyDiscounts, activeTab]);

  useEffect(() => {
    fetchCatalogData();
  }, [fetchCatalogData]);

  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownloadPublitasExcel = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({
        format: 'xlsx',
        search,
        status: statusFilter,
        hasImage: imageFilter,
        onlyDiscounts: String(onlyDiscounts),
      });

      if (activeTab === 'batch' && batchSkus.trim()) {
        params.set('batchSkus', batchSkus.trim());
      }

      const response = await fetch(`/api/catalog/publitas?${params.toString()}`);
      if (!response.ok) throw new Error('Error al generar el archivo Excel de Publitas');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `publitas_product_feed_sinsa_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(`Error descargando Excel Publitas: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadPublitasCsv = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({
        format: 'csv',
        search,
        status: statusFilter,
        hasImage: imageFilter,
        onlyDiscounts: String(onlyDiscounts),
      });

      if (activeTab === 'batch' && batchSkus.trim()) {
        params.set('batchSkus', batchSkus.trim());
      }

      const response = await fetch(`/api/catalog/publitas?${params.toString()}`);
      if (!response.ok) throw new Error('Error al generar el archivo CSV de Publitas');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `publitas_product_feed_sinsa_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(`Error descargando CSV Publitas: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AppLayout>
      <div className="container" style={{ paddingBottom: '3rem' }}>
        {/* ENCABEZADO EJECUTIVO PUBLITAS & CALIDAD DE DATOS */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.99))',
            borderRadius: '18px',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            padding: '1.6rem 1.85rem',
            marginBottom: '1.5rem',
            boxShadow: '0 12px 35px -5px rgba(0, 0, 0, 0.6), 0 0 25px rgba(16, 185, 129, 0.15)',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
                <span style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '0.45rem', borderRadius: '10px', display: 'flex', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <Sparkles size={22} color="#34d399" />
                </span>
                <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.02em' }}>
                  Generador & Feed de Catálogos Publitas
                </h1>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', maxWidth: '820px', lineHeight: 1.5 }}>
                Módulo corporativo para <strong>Calidad de Datos y Marketing Digital</strong>. Estructura la información del catálogo según el estándar oficial de <strong>Publitas</strong> (<code style={{ color: '#34d399' }}>sku, title, link, image_link, price, old_price, brand</code>) para vinculación automática de hotspots en el catálogo digital.
              </p>
            </div>

            {/* BOTONES DE EXPORTACIÓN DIRECTA PUBLITAS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={handleDownloadPublitasExcel}
                disabled={downloading || loading || items.length === 0}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '0.7rem 1.25rem',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  cursor: downloading ? 'wait' : 'pointer',
                  boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)',
                  transition: 'all 0.2s ease',
                  opacity: downloading || loading || items.length === 0 ? 0.6 : 1,
                }}
              >
                <FileSpreadsheet size={19} />
                {downloading ? 'Generando Feed...' : 'Descargar Feed Publitas (.xlsx)'}
              </button>

              <button
                onClick={handleDownloadPublitasCsv}
                disabled={downloading || loading || items.length === 0}
                style={{
                  background: 'rgba(30, 41, 59, 0.9)',
                  color: '#34d399',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                  borderRadius: '12px',
                  padding: '0.7rem 1.1rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: downloading ? 'wait' : 'pointer',
                  transition: 'all 0.2s ease',
                  opacity: downloading || loading || items.length === 0 ? 0.6 : 1,
                }}
              >
                <Download size={16} />
                CSV Publitas
              </button>
            </div>
          </div>
        </div>

        {/* CONTROLES Y PESTAÑAS DE NAVEGACIÓN */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setActiveTab('publitas');
                setPage(1);
              }}
              style={{
                padding: '0.65rem 1.15rem',
                borderRadius: '10px',
                border: activeTab === 'publitas' ? '1px solid #34d399' : '1px solid rgba(255, 255, 255, 0.1)',
                background: activeTab === 'publitas' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(15, 23, 42, 0.6)',
                color: activeTab === 'publitas' ? '#34d399' : '#94a3b8',
                fontWeight: 800,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              <Bookmark size={16} />
              Estándar Publitas ({totalCount} SKUs)
            </button>

            <button
              onClick={() => {
                setActiveTab('catalog');
                setPage(1);
              }}
              style={{
                padding: '0.65rem 1.15rem',
                borderRadius: '10px',
                border: activeTab === 'catalog' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                background: activeTab === 'catalog' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                color: activeTab === 'catalog' ? '#38bdf8' : '#94a3b8',
                fontWeight: 700,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              <Layers size={16} />
              Extracción General PDPs
            </button>

            <button
              onClick={() => {
                setActiveTab('batch');
                setPage(1);
              }}
              style={{
                padding: '0.65rem 1.15rem',
                borderRadius: '10px',
                border: activeTab === 'batch' ? '1px solid #fbbf24' : '1px solid rgba(255, 255, 255, 0.1)',
                background: activeTab === 'batch' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                color: activeTab === 'batch' ? '#fbbf24' : '#94a3b8',
                fontWeight: 700,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              <ShoppingBag size={16} />
              Pegar Lista de SKUs
            </button>
          </div>

          {/* MODO VISTA TARJETAS VS TABLA */}
          {activeTab === 'publitas' && (
            <div style={{ display: 'flex', gap: '0.35rem', background: 'rgba(15, 23, 42, 0.8)', padding: '0.25rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <button
                onClick={() => setViewMode('cards')}
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: viewMode === 'cards' ? '#10b981' : 'transparent',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  cursor: 'pointer',
                }}
              >
                <Grid size={14} /> Simulador Catálogo
              </button>
              <button
                onClick={() => setViewMode('table')}
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: viewMode === 'table' ? '#10b981' : 'transparent',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  cursor: 'pointer',
                }}
              >
                <List size={14} /> Tabla Estructurada
              </button>
            </div>
          )}
        </div>

        {/* FILTROS Y BARRA DE BÚSQUEDA */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '1.1rem 1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          {activeTab !== 'batch' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.35rem' }}>
                  🔍 BUSCAR POR SKU O NOMBRE
                </label>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Ej. 102450 o Azulejo..."
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem 0.55rem 2.3rem',
                      background: 'rgba(30, 41, 59, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.35rem' }}>
                  🏷️ FILTRO DE OFERTAS / DESCUENTOS
                </label>
                <select
                  value={onlyDiscounts ? 'true' : 'false'}
                  onChange={(e) => {
                    setOnlyDiscounts(e.target.value === 'true');
                    setPage(1);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="false">Todos los Productos del Catálogo</option>
                  <option value="true">Solo SKUs en Oferta (Antes C$ / Ahora C$)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.35rem' }}>
                  🖼️ FILTRO DE IMAGEN HD
                </label>
                <select
                  value={imageFilter}
                  onChange={(e) => {
                    setImageFilter(e.target.value);
                    setPage(1);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="all">Todas las Fichas (Con y Sin Foto)</option>
                  <option value="yes">Solo Con Imagen HD Cargada</option>
                  <option value="no">Solo Sin Imagen HD</option>
                </select>
              </div>

              <div>
                <button
                  onClick={fetchCatalogData}
                  style={{
                    width: '100%',
                    padding: '0.55rem 1rem',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    borderRadius: '8px',
                    color: '#34d399',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={14} className={loading ? 'spin' : ''} />
                  Actualizar Lista
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24', marginBottom: '0.4rem' }}>
                📋 PEGAR LISTA DE SKUS SOLICITADOS POR CALIDAD DE DATOS PARA PUBLITAS:
              </label>
              <textarea
                value={batchSkus}
                onChange={(e) => setBatchSkus(e.target.value)}
                placeholder="Ejemplo:&#10;102450&#10;102451&#10;102452, 102453"
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(251, 191, 36, 0.4)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontFamily: 'monospace',
                  marginBottom: '0.75rem',
                }}
              />
              <button
                onClick={() => {
                  setPage(1);
                  fetchCatalogData();
                }}
                disabled={!batchSkus.trim() || loading}
                style={{
                  padding: '0.6rem 1.25rem',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  opacity: !batchSkus.trim() || loading ? 0.6 : 1,
                }}
              >
                <Search size={16} />
                Generar Estructura Publitas de la Lista
              </button>
            </div>
          )}
        </div>

        {/* VISTA SIMULADOR DE TARJETAS TIPO CATÁLOGO PUBLITAS */}
        {activeTab === 'publitas' && viewMode === 'cards' && (
          <div>
            <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>
                Simulación del Catálogo Digital ({items.length} tarjetas de {totalCount} productos)
              </span>
              {loading && <span style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: 600 }}>Cargando catálogo...</span>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.2rem' }}>
              {items.map((it) => {
                const skuId = it.sku || it.id;
                const pdpUrl = it.link || it.pdpUrl;
                const imgUrl = it.image_link || it.imageUrl;
                const title = it.title;
                const brand = it.brand || 'SINSA';
                const priceFormatted = it.price_formatted || `C$ ${(it.price || it.basePriceNio || 0).toLocaleString('es-NI')}`;
                const oldPriceFormatted = it.old_price_formatted || (it.old_price > it.price ? `Antes C$ ${(it.old_price).toLocaleString('es-NI')}` : '');
                const discountPct = it.discount_percentage || (it.discount_pct_num > 0 ? `${it.discount_pct_num}%` : '');
                const isCopiedPdp = copiedKey === `pdp-${skuId}`;
                const isCopiedImg = copiedKey === `img-${skuId}`;

                return (
                  <div
                    key={skuId}
                    style={{
                      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.98))',
                      borderRadius: '16px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      boxShadow: '0 8px 25px rgba(0,0,0,0.45)',
                    }}
                  >
                    {/* ENCABEZADO DE TARJETA TIPO REVISTA PUBLITAS */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.15)', padding: '0.2rem 0.55rem', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                          {brand}
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8' }}>
                          SKU #{skuId}
                        </span>
                      </div>

                      {/* CONTENEDOR DE IMAGEN HD DE PRODUCTO (AMPLIADO Y DESTACADO) */}
                      <div style={{ background: '#ffffff', borderRadius: '12px', padding: '0.75rem', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '210px', position: 'relative', marginBottom: '0.75rem', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt={title}
                            style={{ maxHeight: '195px', maxWidth: '100%', objectFit: 'contain' }}
                          />
                        ) : (
                          <div style={{ color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}>
                            <ImageIcon size={28} />
                            Sin Imagen HD
                          </div>
                        )}

                        {/* BADGE VERDE PRECIO ACTUAL ESTILO PUBLITAS */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '8px',
                            left: '8px',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#ffffff',
                            padding: '0.25rem 0.55rem',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            fontWeight: 900,
                            boxShadow: '0 4px 10px rgba(16, 185, 129, 0.4)',
                          }}
                        >
                          {priceFormatted}
                        </div>
                      </div>

                      {/* TÍTULO DEL PRODUCTO */}
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.35, minHeight: '2.4em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '0.35rem' }}>
                        {title}
                      </div>

                      {/* PRECIO ANTES Y % DESCUENTO */}
                      {oldPriceFormatted ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', textDecoration: 'line-through', fontWeight: 600 }}>
                            {oldPriceFormatted}
                          </span>
                          {discountPct && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                              -{discountPct}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.6rem', fontStyle: 'italic' }}>
                          Precio Regular SINSA
                        </div>
                      )}
                    </div>

                    {/* BOTONES ACCIONADORES DE PUBLITAS */}
                    <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '0.55rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <a
                          href={pdpUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            flex: 1,
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.35)',
                            borderRadius: '6px',
                            padding: '0.35rem 0.4rem',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          Abrir PDP <ExternalLink size={11} />
                        </a>

                        <button
                          onClick={() => handleCopy(pdpUrl, `pdp-${skuId}`)}
                          style={{
                            background: isCopiedPdp ? 'rgba(16, 185, 129, 0.3)' : 'rgba(30, 41, 59, 0.9)',
                            color: isCopiedPdp ? '#34d399' : '#94a3b8',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '6px',
                            padding: '0.35rem 0.5rem',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                          }}
                        >
                          {isCopiedPdp ? <Check size={11} /> : <Copy size={11} />}
                          {isCopiedPdp ? '¡Link!' : 'PDP'}
                        </button>
                      </div>

                      {imgUrl && (
                        <button
                          onClick={() => handleCopy(imgUrl, `img-${skuId}`)}
                          style={{
                            width: '100%',
                            background: isCopiedImg ? 'rgba(56, 189, 248, 0.25)' : 'rgba(30, 41, 59, 0.7)',
                            color: isCopiedImg ? '#38bdf8' : '#64748b',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '0.25rem 0.4rem',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          {isCopiedImg ? <Check size={10} /> : <ImageIcon size={10} />}
                          {isCopiedImg ? '¡URL de Imagen Copiada!' : 'Copiar URL Imagen HD'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VISTA TABLA ESTRUCTURADA ESTÁNDAR PUBLITAS O EXPORTACIÓN */}
        {(activeTab !== 'publitas' || viewMode === 'table') && (
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.85)',
              borderRadius: '14px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>
                Registros Mapeados para Publitas ({items.length} de {totalCount})
              </span>
              {loading && <span style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: 600 }}>Cargando catálogo...</span>}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(30, 41, 59, 0.9)', color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>SKU</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Título / Producto</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Precio Oferta (C$)</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Precio Regular (C$)</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Ficha PDP (sinsa.com.ni)</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Imagen HD</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Marca</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Disponibilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                        {loading ? 'Consultando catálogo...' : 'No se encontraron registros.'}
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => {
                      const skuId = it.sku || it.id;
                      const pdpUrl = it.link || it.pdpUrl;
                      const imgUrl = it.image_link || it.imageUrl;
                      const isAvail = it.availability === 'Disponible' || it.availability === 'in stock' || (it.stock_quantity || 0) > 0;

                      const priceVal = it.price !== undefined && it.price !== null ? Number(it.price) : (it.basePriceNio ? Number(it.basePriceNio) : 0);
                      const oldPriceVal = it.old_price !== undefined && it.old_price !== null ? Number(it.old_price) : (it.listPriceNio ? Number(it.listPriceNio) : 0);

                      const priceDisplay = priceVal > 0 ? `C$ ${priceVal.toLocaleString('es-NI')}` : 'Consultar';
                      const oldPriceDisplay = oldPriceVal > priceVal && priceVal > 0 ? `C$ ${oldPriceVal.toLocaleString('es-NI')}` : '-';

                      return (
                        <tr key={skuId} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 800, color: '#38bdf8' }}>
                            {skuId}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#ffffff', fontWeight: 600, maxWidth: '220px' }}>
                            {it.title}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 800, color: priceVal > 0 ? '#34d399' : '#94a3b8' }}>
                            {priceDisplay}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', textDecoration: 'line-through' }}>
                            {oldPriceDisplay}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', maxWidth: '200px' }}>
                            <a href={pdpUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#34d399', textDecoration: 'none', fontWeight: 700, fontSize: '0.75rem' }}>
                              {pdpUrl}
                            </a>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', maxWidth: '200px' }}>
                            {imgUrl ? (
                              <a href={imgUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 700, fontSize: '0.75rem' }}>
                                {imgUrl.slice(0, 35)}...
                              </a>
                            ) : (
                              <span style={{ color: '#f87171', fontSize: '0.72rem' }}>Sin foto</span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#f59e0b', fontWeight: 700 }}>
                            {it.brand || 'SINSA'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isAvail ? '#34d399' : '#f87171' }}>
                              {isAvail ? 'Disponible' : 'Agotado'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PAGINACIÓN */}
        {totalPages > 1 && (
          <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              Página {page} de {totalPages}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: 'rgba(30, 41, 59, 0.8)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: page <= 1 || loading ? 'not-allowed' : 'pointer',
                  opacity: page <= 1 || loading ? 0.5 : 1,
                }}
              >
                Anterior
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: 'rgba(30, 41, 59, 0.8)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: page >= totalPages || loading ? 'not-allowed' : 'pointer',
                  opacity: page >= totalPages || loading ? 0.5 : 1,
                }}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
