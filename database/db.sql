-- ------------------------------------------------------------------
-- SCRIPT COMPLETO CONSOLIDADO: GAZELLA EXPRESS (VENEZUELA UTC-4)
-- ACTUALIZACIÓN: SISTEMA DE COLA ESTÁTICA (FIFO) PARA REPARTIDORES
-- ------------------------------------------------------------------

-- 1. LIMPIEZA DE ENTORNO
DROP VIEW IF EXISTS vista_pedidos_resumen;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS repartidores_pedidos;
DROP TABLE IF EXISTS pedido_detalles;
DROP TABLE IF EXISTS pedidos;
DROP TABLE IF EXISTS direcciones;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS repartidores; 
DROP TABLE IF EXISTS tipos_vehiculos;
DROP TABLE IF EXISTS tipos_servicios;
DROP TABLE IF EXISTS exchange_rates;
DROP TABLE IF EXISTS usuarios CASCADE; 

-- Habilitar extensión para contraseñas seguras
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------
-- 2. TABLAS MAESTRAS (Configuración y Tipos)
-- ------------------------------------------------------------------

CREATE TABLE exchange_rates (
    id SERIAL PRIMARY KEY,
    rate NUMERIC(10, 4) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tipos_vehiculos (
    id SERIAL PRIMARY KEY,
    descript VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    amount_pay DECIMAL(10, 2) DEFAULT 0
);

CREATE TABLE tipos_servicios (
    id SERIAL PRIMARY KEY,
    descript VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    amount_pay DECIMAL(10, 2) DEFAULT 0
);

-- ------------------------------------------------------------------
-- 3. GESTIÓN DE USUARIOS Y PERFILES
-- ------------------------------------------------------------------

CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL, 
    telefono VARCHAR(20),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('cliente', 'repartidor', 'administrador', 'supervisor')),
    fecha_creacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    password_hash VARCHAR(255) NOT NULL
);

-- REPARTIDORES: Incorporación de lógica de disponibilidad y cola FIFO
CREATE TABLE repartidores (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE UNIQUE, 
    tipo_vehiculo_id INT REFERENCES tipos_vehiculos(id),
    documento_identidad VARCHAR(50) NOT NULL,
    tipo_documento VARCHAR(20) NOT NULL CHECK (tipo_documento IN ('CI', 'Pasaporte', 'Licencia', 'Otro')),
    foto VARCHAR(255),
    foto_vehiculo VARCHAR(255),  -- Nueva: Foto de la moto/carro
    -- Control Administrativo para inactivar o activar el conductor en la plataforma
    is_active VARCHAR(20) DEFAULT 'activo' CHECK (is_active IN ('activo','suspendido')),
    
    -- Nuevos campos para la gestión de entregas (Cola Estática)
    is_available BOOLEAN DEFAULT FALSE,             -- Switch On/Off del repartidor
    available_since TIMESTAMP WITHOUT TIME ZONE,                   -- Fecha/Hora de ingreso a la cola (Posición FIFO)
    ultima_entrega_at TIMESTAMP WITHOUT TIME ZONE                 -- Histórico para reportes
);

-- Índice parcial: Solo indexa repartidores disponibles para búsquedas ultrarrápidas de la cola
CREATE INDEX idx_repartidores_fifo_queue ON repartidores (available_since) 
WHERE is_available = TRUE;

-- ------------------------------------------------------------------
-- 4. LOGÍSTICA (Direcciones y Productos)
-- ------------------------------------------------------------------

CREATE TABLE productos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    precio DECIMAL(10, 2) NOT NULL,
    categoria VARCHAR(50),
    disponible BOOLEAN DEFAULT TRUE
);

CREATE TABLE direcciones (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    calle VARCHAR(255) NOT NULL,
    ciudad VARCHAR(100) NOT NULL,
    codigo_postal VARCHAR(10),
    latitud DECIMAL(9, 6),
    longitud DECIMAL(9, 6),
    municipio VARCHAR(100) NOT NULL 
);

-- ------------------------------------------------------------------
-- 5. NÚCLEO DE NEGOCIO (Pedidos y Pagos)
-- ------------------------------------------------------------------

CREATE TABLE pedidos (
    id SERIAL PRIMARY KEY,
    cliente_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    direccion_origen_id INT NOT NULL REFERENCES direcciones(id),
    direccion_destino_id INT NOT NULL REFERENCES direcciones(id), 
    tipo_servicio_id INT REFERENCES tipos_servicios(id),
    tipo_vehiculo_id INT REFERENCES tipos_vehiculos(id),
    nro_recibo TEXT,
    fecha_pedido TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'asignado', 'en_camino', 'entregado', 'cancelado')),
    total DECIMAL(10, 2) NOT NULL,
    total_dolar DECIMAL(10, 2) DEFAULT 0,
    municipio_origen VARCHAR(100),
    municipio_destino VARCHAR(100),
    pago_confirmado BOOLEAN DEFAULT FALSE,
    repartidor_id INT REFERENCES usuarios(id)
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    pedido_id INT REFERENCES pedidos(id) ON DELETE CASCADE,
    cliente_id INT REFERENCES usuarios(id),
    metodo_pago VARCHAR(50) DEFAULT 'pago_movil_mercantil',
    referencia_bancaria VARCHAR(20) NOT NULL,
    telefono_pagador VARCHAR(20) NOT NULL,
    monto_ves DECIMAL(12, 2) NOT NULL,
    tasa_aplicada DECIMAL(12, 4) NOT NULL,
    estado_pago VARCHAR(20) DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente', 'completado', 'fallido')),
    bank_tx_id VARCHAR(100),
    mensaje_respuesta_banco TEXT,
    fecha_pago TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------
-- 6. DETALLES Y ASIGNACIONES
-- ------------------------------------------------------------------

CREATE TABLE pedido_detalles (
    id SERIAL PRIMARY KEY,
    pedido_id INT REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id INT REFERENCES productos(id) ON DELETE CASCADE,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(10, 2) NOT NULL
);

CREATE TABLE repartidores_pedidos (
    id SERIAL PRIMARY KEY,
    repartidor_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    pedido_id INT REFERENCES pedidos(id) ON DELETE CASCADE,
    fecha_asignacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    fecha_entrega TIMESTAMPTZ -- Para medir tiempos de respuesta
);

-- ------------------------------------------------------------------
-- 7. VISTA DE MONITOREO (Resumen Operativo)
-- ------------------------------------------------------------------

CREATE VIEW vista_pedidos_resumen AS
SELECT 
    p.id AS pedido_id,
    u.nombre AS cliente,
    p.fecha_pedido,
    p.estado AS estado_pedido,
    COALESCE(pay.estado_pago, 'no_registrado') AS estado_pago,
    p.total AS total_ves,
    p.total_dolar,
    ts.descript AS servicio,
    COALESCE(tv.descript, 'Sin asignar') AS vehiculo_repartidor,
    d.calle || ', ' || d.ciudad AS direccion_entrega,
    pay.referencia_bancaria AS ref_pago
FROM pedidos p
JOIN usuarios u ON p.cliente_id = u.id
JOIN direcciones d ON p.direccion_destino_id = d.id
LEFT JOIN tipos_servicios ts ON p.tipo_servicio_id = ts.id
LEFT JOIN payments pay ON p.id = pay.pedido_id
LEFT JOIN repartidores_pedidos rp ON p.id = rp.pedido_id
LEFT JOIN repartidores r ON rp.repartidor_id = r.usuario_id
LEFT JOIN tipos_vehiculos tv ON r.tipo_vehiculo_id = tv.id;

-- ------------------------------------------------------------------
-- 8. DATOS INICIALES Y ADMINISTRADOR
-- ------------------------------------------------------------------

INSERT INTO usuarios (nombre, email, telefono, tipo, password_hash)
SELECT 'Administrador Global', 'ramongonzalez101@gmail.com', '999999', 'administrador', crypt('admin1234', gen_salt('bf'))
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'ramongonzalez101@gmail.com');

-- Índices adicionales para optimización
CREATE INDEX idx_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX idx_payments_ref ON payments(referencia_bancaria);
CREATE INDEX idx_repartidores_disponibilidad ON repartidores(is_available);
-- -- ------------------------------------------------------------------
-- -- SCRIPT COMPLETO CONSOLIDADO: GAZELLA EXPRESS (VENEZUELA UTC-4)
-- -- ------------------------------------------------------------------

-- -- 1. LIMPIEZA DE ENTORNO
-- DROP VIEW IF EXISTS vista_pedidos_resumen;
-- DROP TABLE IF EXISTS payments;
-- DROP TABLE IF EXISTS repartidores_pedidos;
-- DROP TABLE IF EXISTS pedido_detalles;
-- DROP TABLE IF EXISTS pedidos;
-- DROP TABLE IF EXISTS direcciones;
-- DROP TABLE IF EXISTS productos;
-- DROP TABLE IF EXISTS repartidores; 
-- DROP TABLE IF EXISTS tipos_vehiculos;
-- DROP TABLE IF EXISTS tipos_servicios;
-- DROP TABLE IF EXISTS exchange_rates;
-- DROP TABLE IF EXISTS usuarios CASCADE; 

-- -- Habilitar extensión para contraseñas seguras
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -- ------------------------------------------------------------------
-- -- 2. TABLAS MAESTRAS (Configuración y Tipos)
-- -- ------------------------------------------------------------------

-- CREATE TABLE exchange_rates (
--     id SERIAL PRIMARY KEY,
--     rate NUMERIC(10, 4) NOT NULL,
--     currency VARCHAR(10) DEFAULT 'USD',
--     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- CREATE TABLE tipos_vehiculos (
--     id SERIAL PRIMARY KEY,
--     descript VARCHAR(100) NOT NULL,
--     is_active BOOLEAN DEFAULT TRUE,
--     amount_pay DECIMAL(10, 2) DEFAULT 0
-- );

-- CREATE TABLE tipos_servicios (
--     id SERIAL PRIMARY KEY,
--     descript VARCHAR(100) NOT NULL,
--     is_active BOOLEAN DEFAULT TRUE,
--     amount_pay DECIMAL(10, 2) DEFAULT 0
-- );

-- -- ------------------------------------------------------------------
-- -- 3. GESTIÓN DE USUARIOS Y PERFILES
-- -- ------------------------------------------------------------------

-- CREATE TABLE usuarios (
--     id SERIAL PRIMARY KEY,
--     nombre VARCHAR(100) NOT NULL,
--     email VARCHAR(100) UNIQUE NOT NULL, 
--     telefono VARCHAR(20),
--     tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('cliente', 'repartidor', 'administrador', 'supervisor')),
--     fecha_creacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
--     password_hash VARCHAR(255) NOT NULL
-- );

-- CREATE TABLE repartidores (
--     id SERIAL PRIMARY KEY,
--     usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE UNIQUE, 
--     tipo_vehiculo_id INT REFERENCES tipos_vehiculos(id),
--     documento_identidad VARCHAR(50) NOT NULL,
--     tipo_documento VARCHAR(20) NOT NULL CHECK (tipo_documento IN ('DNI', 'Pasaporte', 'Licencia', 'Otro')),
--     foto VARCHAR(255) 
-- );

-- -- ------------------------------------------------------------------
-- -- 4. LOGÍSTICA (Direcciones y Productos)
-- -- ------------------------------------------------------------------

-- CREATE TABLE productos (
--     id SERIAL PRIMARY KEY,
--     nombre VARCHAR(100) NOT NULL,
--     descripcion TEXT,
--     precio DECIMAL(10, 2) NOT NULL,
--     categoria VARCHAR(50),
--     disponible BOOLEAN DEFAULT TRUE
-- );

-- CREATE TABLE direcciones (
--     id SERIAL PRIMARY KEY,
--     usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
--     calle VARCHAR(255) NOT NULL,
--     ciudad VARCHAR(100) NOT NULL,
--     codigo_postal VARCHAR(10),
--     latitud DECIMAL(9, 6),
--     longitud DECIMAL(9, 6),
--     municipio VARCHAR(100) NOT NULL 
-- );

-- -- ------------------------------------------------------------------
-- -- 5. NÚCLEO DE NEGOCIO (Pedidos y Pagos)
-- -- ------------------------------------------------------------------

-- CREATE TABLE pedidos (
--     id SERIAL PRIMARY KEY,
--     cliente_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
--     direccion_origen_id INT NOT NULL REFERENCES direcciones(id),
--     direccion_destino_id INT NOT NULL REFERENCES direcciones(id), 
--     tipo_servicio_id INT REFERENCES tipos_servicios(id),
--     tipo_vehiculo_id INT REFERENCES tipos_vehiculos(id),
--     nro_recibo TEXT, -- Referencia manual o informativa
--     fecha_pedido TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
--     estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_camino', 'entregado', 'cancelado')),
--     total DECIMAL(10, 2) NOT NULL, -- Total en VES
--     total_dolar DECIMAL(10, 2) DEFAULT 0,
--     municipio_origen VARCHAR(100),
--     municipio_destino VARCHAR(100),
--     pago_confirmado BOOLEAN DEFAULT FALSE -- Flag rápido para despacho
-- );

-- CREATE TABLE payments (
--     id SERIAL PRIMARY KEY,
--     pedido_id INT REFERENCES pedidos(id) ON DELETE CASCADE,
--     cliente_id INT REFERENCES usuarios(id),
    
--     -- Datos para validación Bancaria (Mercantil)
--     metodo_pago VARCHAR(50) DEFAULT 'pago_movil_mercantil',
--     referencia_bancaria VARCHAR(20) NOT NULL,
--     telefono_pagador VARCHAR(20) NOT NULL,
    
--     -- Valores económicos históricos
--     monto_ves DECIMAL(12, 2) NOT NULL,
--     tasa_aplicada DECIMAL(12, 4) NOT NULL,
    
--     -- Respuesta del API
--     estado_pago VARCHAR(20) DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente', 'completado', 'fallido')),
--     bank_tx_id VARCHAR(100), -- ID retornado por el banco
--     mensaje_respuesta_banco TEXT,
--     fecha_pago TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
-- );

-- -- ------------------------------------------------------------------
-- -- 6. DETALLES Y ASIGNACIONES
-- -- ------------------------------------------------------------------

-- CREATE TABLE pedido_detalles (
--     id SERIAL PRIMARY KEY,
--     pedido_id INT REFERENCES pedidos(id) ON DELETE CASCADE,
--     producto_id INT REFERENCES productos(id) ON DELETE CASCADE,
--     cantidad INT NOT NULL,
--     precio_unitario DECIMAL(10, 2) NOT NULL
-- );

-- CREATE TABLE repartidores_pedidos (
--     id SERIAL PRIMARY KEY,
--     repartidor_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
--     pedido_id INT REFERENCES pedidos(id) ON DELETE CASCADE,
--     fecha_asignacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
-- );

-- -- ------------------------------------------------------------------
-- -- 7. VISTA DE MONITOREO (Resumen Operativo)
-- -- ------------------------------------------------------------------

-- CREATE VIEW vista_pedidos_resumen AS
-- SELECT 
--     p.id AS pedido_id,
--     u.nombre AS cliente,
--     p.fecha_pedido,
--     p.estado AS estado_pedido,
--     COALESCE(pay.estado_pago, 'no_registrado') AS estado_pago,
--     p.total AS total_ves,
--     p.total_dolar,
--     ts.descript AS servicio,
--     COALESCE(tv.descript, 'Sin asignar') AS vehiculo_repartidor,
--     d.calle || ', ' || d.ciudad AS direccion_entrega,
--     pay.referencia_bancaria AS ref_pago
-- FROM pedidos p
-- JOIN usuarios u ON p.cliente_id = u.id
-- JOIN direcciones d ON p.direccion_destino_id = d.id
-- LEFT JOIN tipos_servicios ts ON p.tipo_servicio_id = ts.id
-- LEFT JOIN payments pay ON p.id = pay.pedido_id
-- LEFT JOIN repartidores_pedidos rp ON p.id = rp.pedido_id
-- LEFT JOIN repartidores r ON rp.repartidor_id = r.usuario_id
-- LEFT JOIN tipos_vehiculos tv ON r.tipo_vehiculo_id = tv.id;

-- -- ------------------------------------------------------------------
-- -- 8. DATOS INICIALES Y ADMINISTRADOR
-- -- ------------------------------------------------------------------

-- INSERT INTO usuarios (nombre, email, telefono, tipo, password_hash)
-- SELECT 'Administrador Global', 'ramongonzalez101@gmail.com', '999999', 'administrador', crypt('admin1234', gen_salt('bf'))
-- WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'ramongonzalez101@gmail.com');

-- -- Índices sugeridos para velocidad en búsquedas frecuentes
-- CREATE INDEX idx_pedidos_cliente ON pedidos(cliente_id);
-- CREATE INDEX idx_payments_ref ON payments(referencia_bancaria);

