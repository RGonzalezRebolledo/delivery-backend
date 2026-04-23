import { pool } from '../db.js';

export const assignPendingOrders = async (io) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Buscamos el pedido pendiente más antiguo
        const pendingQuery = `
            SELECT p.id, p.total_dolar as monto, u.nombre as cliente_nombre,
                   dir_o.calle as recogida, dir_d.calle as entrega
            FROM pedidos p
            JOIN usuarios u ON p.cliente_id = u.id
            JOIN direcciones dir_o ON p.direccion_origen_id = dir_o.id
            JOIN direcciones dir_d ON p.direccion_destino_id = dir_d.id
            WHERE p.estado = 'pendiente'
            ORDER BY p.fecha_pedido ASC
            LIMIT 1 FOR UPDATE SKIP LOCKED; 
        `;
        // 'FOR UPDATE SKIP LOCKED' evita que dos procesos asignen el mismo pedido a la vez

        const orderRes = await client.query(pendingQuery);
        if (orderRes.rows.length === 0) {
            await client.query('COMMIT');
            return;
        }

        const pedido = orderRes.rows[0];

        // 2. Buscamos al repartidor disponible que más tiempo lleva esperando
        const driverQuery = `
            SELECT usuario_id FROM repartidores 
            WHERE is_available = true AND is_active = 'activo'
            ORDER BY available_since ASC
            LIMIT 1 FOR UPDATE SKIP LOCKED;
        `;

        const driverRes = await client.query(driverQuery);
        if (driverRes.rows.length === 0) {
            await client.query('COMMIT');
            return;
        }

        const driverId = driverRes.rows[0].usuario_id;

        // 3. Ejecutamos la asignación
        await client.query(
            "UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2",
            [driverId, pedido.id]
        );

        await client.query(
            "UPDATE repartidores SET is_available = false WHERE usuario_id = $1",
            [driverId]
        );

        await client.query('COMMIT');

        // 4. 🔥 NOTIFICACIÓN EN TIEMPO REAL
        // Enviamos el objeto con el formato que espera tu Dashboard
        io.to(`driver_${driverId}`).emit('NUEVO_PEDIDO', {
            pedido_id: pedido.id,
            monto: pedido.monto,
            cliente_nombre: pedido.cliente_nombre,
            recogida: pedido.recogida,
            entrega: pedido.entrega,
            estado: 'asignado'
        });

        console.log(`✅ Pedido ${pedido.id} asignado automáticamente al driver ${driverId}`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("❌ Error en asignación automática:", error);
    } finally {
        client.release();
    }
};