-- ==============================================================================
-- TABLA DE STOCK DE SEGURIDAD (RELACIÓN SKU + DESCRIPCIÓN + STOCK MÍNIMO)
-- Copia y ejecuta este bloque en el SQL Editor de Supabase
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.vtex_safety_stock (
    sku_id BIGINT PRIMARY KEY,
    description TEXT NULL,
    safety_stock INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vtex_safety_stock_sku ON public.vtex_safety_stock(sku_id);

ALTER TABLE public.vtex_safety_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir acceso total vtex_safety_stock" ON public.vtex_safety_stock FOR ALL USING (true) WITH CHECK (true);


-- ==============================================================================
-- ACTUALIZACIÓN DE TABLA VTEX_SKUS: AGREGAR COLUMNAS DE DESGLOSE DE INVENTARIO Y PRECIOS
-- ==============================================================================

ALTER TABLE public.vtex_skus 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS wh1_total INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wh1_reserved INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wh2_total INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wh2_reserved INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_quantity INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_reserved INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS list_price NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS base_price NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Crear índices de apoyo para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_vtex_skus_is_active ON public.vtex_skus(is_active);
CREATE INDEX IF NOT EXISTS idx_vtex_skus_wh1_reserved ON public.vtex_skus(wh1_reserved);
CREATE INDEX IF NOT EXISTS idx_vtex_skus_wh2_reserved ON public.vtex_skus(wh2_reserved);
CREATE INDEX IF NOT EXISTS idx_vtex_skus_base_price ON public.vtex_skus(base_price);
CREATE INDEX IF NOT EXISTS idx_vtex_skus_list_price ON public.vtex_skus(list_price);


-- ==============================================================================
-- TABLA COMPLETA DESDE CERO (SI DESEAS RECREARLA COMPLETA)
-- ==============================================================================
/*
DROP TABLE IF EXISTS public.vtex_skus CASCADE;

CREATE TABLE public.vtex_skus (
    id BIGINT PRIMARY KEY,                        -- ID del SKU en VTEX
    is_active BOOLEAN DEFAULT true,               -- Estado (true: Activo, false: Inactivo)
    
    -- Bodega 1 / Mega (ID 24)
    wh1_total INT NULL DEFAULT 0,                 -- Total (Last Update) Mega
    wh1_reserved INT NULL DEFAULT 0,              -- Reservado Mega
    stock_wh1 INT NULL DEFAULT 0,                 -- Disponible Mega (wh1_total - wh1_reserved)
    
    -- Bodega 2 / Cedis (ID 1041)
    wh2_total INT NULL DEFAULT 0,                 -- Total (Last Update) Cedis
    wh2_reserved INT NULL DEFAULT 0,              -- Reservado Cedis
    stock_wh2 INT NULL DEFAULT 0,                 -- Disponible Cedis (wh2_total - wh2_reserved)
    
    -- Totales Consolidados
    total_quantity INT NULL DEFAULT 0,            -- Total Físico Consolidado
    total_reserved INT NULL DEFAULT 0,            -- Total Reservado Consolidado
    total_stock INT NULL DEFAULT 0,               -- Total Disponible (total_quantity - total_reserved)
    
    inventory_detail JSONB NULL,                 -- JSON balance original VTEX
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

-- ==============================================================================
-- TABLA DE ÓRDENES VTEX OMS EN TIEMPO REAL (HISTORIAL + WEBSOCKETS REALTIME)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.vtex_orders (
    order_id TEXT PRIMARY KEY,
    sequence TEXT NULL,
    status TEXT NOT NULL,
    status_description TEXT NULL,
    creation_date TIMESTAMPTZ NOT NULL,
    client_name TEXT NULL,
    client_email TEXT NULL,
    total_value NUMERIC(12,2) DEFAULT 0,
    items JSONB NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vtex_orders_status ON public.vtex_orders(status);
CREATE INDEX IF NOT EXISTS idx_vtex_orders_creation ON public.vtex_orders(creation_date DESC);

ALTER TABLE public.vtex_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir acceso total vtex_orders" ON public.vtex_orders FOR ALL USING (true) WITH CHECK (true);

-- Habilitar publicación en tiempo real para la tabla vtex_orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.vtex_orders;


-- ==============================================================================
-- TABLA DE USUARIOS AUTORIZADOS PARA CONTROL DE ACCESO Y ROLES (APP_USERS)
-- Estructura exacta en Supabase
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    username TEXT UNIQUE,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Ejecutivo OMS',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_app_users_email ON public.app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_active ON public.app_users(is_active);

-- Políticas RLS Seguras
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso total app_users" ON public.app_users;
CREATE POLICY "Permitir acceso total app_users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);


-- ==============================================================================
-- TABLAS DEL SISTEMA DE ROLES Y PERMISOS DINÁMICOS (RBAC)
-- Copia y ejecuta este bloque en el SQL Editor de Supabase
-- ==============================================================================

-- 1. Tabla de Roles
CREATE TABLE IF NOT EXISTS public.app_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Permisos por Módulo
CREATE TABLE IF NOT EXISTS public.app_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    description TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla Intermedia Matriz de Permisos por Rol
CREATE TABLE IF NOT EXISTS public.app_role_permissions (
    role_id UUID REFERENCES public.app_roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES public.app_permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

-- Habilitar RLS e Idempotencia de Políticas
ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso total app_roles" ON public.app_roles;
CREATE POLICY "Permitir acceso total app_roles" ON public.app_roles FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.app_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso total app_permissions" ON public.app_permissions;
CREATE POLICY "Permitir acceso total app_permissions" ON public.app_permissions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.app_role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir acceso total app_role_permissions" ON public.app_role_permissions;
CREATE POLICY "Permitir acceso total app_role_permissions" ON public.app_role_permissions FOR ALL USING (true) WITH CHECK (true);

-- Catalogó Semilla de Permisos Iniciales por Módulo
INSERT INTO public.app_permissions (code, name, category, description)
VALUES
    ('dashboard:view', 'Ver Dashboard de Ventas & KPIs', 'Ventas', 'Permite acceder al dashboard de métricas de ventas'),
    ('tendencias:view', 'Ver Tendencias E-Commerce', 'Ventas', 'Permite analizar tendencias de ventas e-commerce'),
    ('skus:view', 'Ver Catálogo e Inventario SKUs', 'Inventario', 'Permite visualizar la lista completa de SKUs'),
    ('skus:sync', 'Sincronizar SKUs Masivos', 'Inventario', 'Permite ejecutar la sincronización desde VTEX a Supabase'),
    ('safety_stock:manage', 'Gestionar Stock de Seguridad', 'Inventario', 'Permite editar los límites mínimos de stock de seguridad'),
    ('prices:manage', 'Gestionar Precios & Descuentos', 'Precios', 'Permite ver y actualizar los precios de catálogo VTEX'),
    ('simulador:use', 'Usar Simulador de Carrito', 'Promociones', 'Permite simular carritos de compra y promociones'),
    ('orders:view', 'Ver Órdenes VTEX OMS', 'Órdenes', 'Permite consultar órdenes de compra en tiempo real'),
    ('transactions:view', 'Ver Transacciones & Pasarelas', 'Pagos', 'Permite inspeccionar transacciones y diagnósticos de cobro'),
    ('users:manage', 'Administrar Usuarios, Roles & Permisos', 'Administración', 'Acceso completo a la gestión de cuentas y permisos')
ON CONFLICT (code) DO NOTHING;

-- Catálogo Semilla de Roles Iniciales
INSERT INTO public.app_roles (name, description)
VALUES
    ('Administrador Ejecutivo', 'Acceso total a todos los módulos y administración de permisos'),
    ('Ejecutivo OMS', 'Acceso a inventario, órdenes, ventas y transacciones'),
    ('Auditor de Inventario', 'Acceso de consulta a SKUs, stock de seguridad y precios'),
    ('Gerencia de Ventas', 'Acceso a reportes de dashboard, tendencias y órdenes OMS')
ON CONFLICT (name) DO NOTHING;

-- Matriz de Relaciones Semilla Iniciales (role_id + permission_id)
-- 1. Conceder todos los permisos al Administrador Ejecutivo
INSERT INTO public.app_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name = 'Administrador Ejecutivo'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2. Conceder permisos operativos al Ejecutivo OMS
INSERT INTO public.app_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
JOIN public.app_permissions p ON p.code IN ('dashboard:view', 'skus:view', 'orders:view', 'transactions:view')
WHERE r.name = 'Ejecutivo OMS'
ON CONFLICT (role_id, permission_id) DO NOTHING;








