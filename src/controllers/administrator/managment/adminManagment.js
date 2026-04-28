// controllers/adminController.js
import { pool } from '../../../db.js'

// 1. Listado de Clientes
export const getAdminClients = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, nombre, email, telefono, fecha_creacion 
            FROM usuarios 
            WHERE tipo = 'cliente' 
            ORDER BY fecha_creacion DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. Listado de Pedidos Activos
export const getAdminActiveOrders = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id, p.estado, p.total, p.total_dolar, p.fecha_pedido,
                u_cli.nombre as cliente_nombre,
                u_rep.nombre as repartidor_nombre,
                dir_o.calle as origen, dir_d.calle as destino
            FROM pedidos p
            JOIN usuarios u_cli ON p.cliente_id = u_cli.id
            LEFT JOIN usuarios u_rep ON p.repartidor_id = u_rep.id
            JOIN direcciones dir_o ON p.direccion_origen_id = dir_o.id
            JOIN direcciones dir_d ON p.direccion_destino_id = dir_d.id
            WHERE p.estado NOT IN ('finalizado', 'entregado')
            ORDER BY p.fecha_pedido DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 3. Listado de Repartidores Activos y su pedido actual
export const getAdminDriversStatus = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.nombre, u.telefono, r.is_available, r.tiene_pedido,
                tv.descript as vehiculo,
                (SELECT p.id FROM pedidos p 
                 WHERE p.repartidor_id = u.id 
                 AND p.estado IN ('asignado', 'en_camino') 
                 LIMIT 1) as pedido_actual_id
            FROM repartidores r
            JOIN usuarios u ON r.usuario_id = u.id
            LEFT JOIN tipos_vehiculos tv ON r.tipo_vehiculo_id = tv.id
            WHERE r.is_active = 'activo'
            ORDER BY r.tiene_pedido DESC, u.nombre ASC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};