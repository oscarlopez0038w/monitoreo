-- ==============================================================================
-- ACTUALIZACIÓN DE TABLA: AGREGAR COLUMNA IS_ACTIVE (ESTADO ACTIVO/INACTIVO)
-- Copia y ejecuta este bloque en el SQL Editor de Supabase si ya tienes la tabla.
-- ==============================================================================

ALTER TABLE public.vtex_skus 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Crear índice para filtrar por SKUs Activos/Inactivos rápidamente
CREATE INDEX IF NOT EXISTS idx_vtex_skus_is_active ON public.vtex_skus(is_active);


-- ==============================================================================
-- TABLA COMPLETA DESDE CERO (SI DESEAS RECREARLA COMPLETA)
-- ==============================================================================
/*
DROP TABLE IF EXISTS public.vtex_skus CASCADE;

CREATE TABLE public.vtex_skus (
    id BIGINT PRIMARY KEY,                        -- ID del SKU en VTEX
    is_active BOOLEAN DEFAULT true,               -- Estado (true: Activo, false: Inactivo)
    stock_wh1 INT NULL DEFAULT 0,                -- Stock Bodega 1
    stock_wh2 INT NULL DEFAULT 0,                -- Stock Bodega 2
    total_stock INT NULL DEFAULT 0,              -- Total Consolidado
    inventory_detail JSONB NULL,                 -- Detalle de reservas/bodegas
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    inventory_updated_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_vtex_skus_id ON public.vtex_skus(id);
CREATE INDEX idx_vtex_skus_is_active ON public.vtex_skus(is_active);
CREATE INDEX idx_vtex_skus_total_stock ON public.vtex_skus(total_stock);

ALTER TABLE public.vtex_skus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir acceso total vtex_skus" ON public.vtex_skus FOR ALL USING (true) WITH CHECK (true);
*/
