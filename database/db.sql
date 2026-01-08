-- ------------------------------------------------------------------
-- SCRIPT COMPLETO ACTUALIZADO - ESQUEMA 'delivery'
-- ------------------------------------------------------------------

-- 1. LIMPIEZA
DROP VIEW IF EXISTS vista_pedidos_resumen;
DROP TABLE IF EXISTS repartidores_pedidos;
DROP TABLE IF EXISTS pedido_detalles;
DROP TABLE IF EXISTS pedidos;
DROP TABLE IF EXISTS direcciones;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS repartidores; 
DROP TABLE IF EXISTS tipos_vehiculos; -- Nueva tabla
DROP TABLE IF EXISTS tipos_servicios; -- Nueva tabla
DROP TABLE IF EXISTS usuarios CASCADE; 

-- ------------------------------------------------------------------
-- 2. TABLAS MAESTRAS (NUEVAS)
-- ------------------------------------------------------------------

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
-- 3. CREACIÓN DE TABLAS BASE
-- ------------------------------------------------------------------

CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL, 
    telefono VARCHAR(20),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('cliente', 'repartidor', 'administrador', 'supervisor')),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    password_hash VARCHAR(255) NOT NULL
);

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
    longitud DECIMAL(9, 6)
);

CREATE TABLE pedidos (
    id SERIAL PRIMARY KEY,
    cliente_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    direccion_destino_id INT REFERENCES direcciones(id), 
    direccion_origen_id INT NOT NULL REFERENCES direcciones(id),
    tipo_servicio_id INT REFERENCES tipos_servicios(id), -- RELACIÓN CON SERVICIO
    tipo_vehiculo_id INT REFERENCES tipos_vehiculos(id), -- RELACIÓN CON VEHICULOS
    nro_recibo TEXT,
    fecha_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_camino', 'entregado', 'cancelado')),
    total DECIMAL(10, 2) NOT NULL,
    total_dolar DECIMAL(10, 2) DEFAULT 0
);

CREATE TABLE repartidores (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE UNIQUE, 
    tipo_vehiculo_id INT REFERENCES tipos_vehiculos(id), -- RELACIÓN CON VEHÍCULO
    documento_identidad VARCHAR(50) NOT NULL,
    tipo_documento VARCHAR(20) NOT NULL CHECK (tipo_documento IN ('DNI', 'Pasaporte', 'Licencia', 'Otro')),
    foto VARCHAR(255) 
);

-- Tablas de detalles y relaciones n:m
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
    fecha_asignacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------
-- 4. VISTA ACTUALIZADA (Incluye Servicio y Vehículo)
-- ------------------------------------------------------------------

CREATE VIEW vista_pedidos_resumen AS
SELECT 
    p.id AS pedido_id,
    u.nombre AS cliente,
    p.fecha_pedido,
    p.estado,
    p.total,
    ts.descript AS servicio,
    COALESCE(tv.descript, 'Sin asignar') AS vehiculo_repartidor,
    d.calle || ', ' || d.ciudad AS direccion_entrega
FROM pedidos p
JOIN usuarios u ON p.cliente_id = u.id
JOIN direcciones d ON p.direccion_destino_id = d.id
LEFT JOIN tipos_servicios ts ON p.tipo_servicio_id = ts.id
LEFT JOIN repartidores_pedidos rp ON p.id = rp.pedido_id
LEFT JOIN repartidores r ON rp.repartidor_id = r.usuario_id
LEFT JOIN tipos_vehiculos tv ON r.tipo_vehiculo_id = tv.id;

-- ------------------------------------------------------------------
-- 5. DATOS INICIALES Y SEGURIDAD
-- ------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Insertar Tipos Base
-- INSERT INTO tipos_vehiculos (descripcion, amount_pay) VALUES ('Bicicleta', 0), ('Moto', 1.50), ('Auto', 3.00);
-- INSERT INTO tipos_servicios (descripcion, amount_pay) VALUES ('Estándar', 2.00), ('Express', 5.00);

-- Admin por defecto
INSERT INTO usuarios (nombre, email, telefono, tipo, password_hash)
SELECT 'Administrador Global', 'ramongonzalez101@gmail.com', '999999', 'administrador', crypt('admin1234', gen_salt('bf'))
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'ramongonzalez101@gmail.com');
