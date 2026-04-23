import { pool } from '../db.js';

export const assignPendingOrders = async (io) => {
    if (!io) {
        console.error("❌ No hay instancia de Socket.io");
        return;
    }

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // Buscamos el pedido pendiente más antiguo
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

        const orderRes = await client.query(pendingQuery);
        if (orderRes.rows.length === 0) {
            await client.query('COMMIT');
            return;
        }

        const pedido = orderRes.rows[0];

        // Buscamos al repartidor disponible
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

        // Actualización de DB
        await client.query(
            "UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2",
            [driverId, pedido.id]
        );

        await client.query(
            "UPDATE repartidores SET is_available = false WHERE usuario_id = $1",
            [driverId]
        );

        await client.query('COMMIT');

        // --- NOTIFICACIÓN ---
        const targetRoom = `driver_${driverId}`;
        
        // Verificamos si hay alguien en la sala
        const socketsInRoom = await io.in(targetRoom).fetchSockets();
        console.log(`📡 Notificando a sala: ${targetRoom} | Sockets: ${socketsInRoom.length}`);

        io.to(targetRoom).emit('NUEVO_PEDIDO', {
            pedido_id: pedido.id,
            monto: pedido.monto,
            cliente_nombre: pedido.cliente_nombre,
            recogida: pedido.recogida,
            entrega: pedido.entrega,
            estado: 'asignado'
        });

        console.log(`✅ Pedido ${pedido.id} enviado al conductor ${driverId}`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("❌ Error en asignación:", error);
    } finally {
        client.release();
    }
};

// import { pool } from '../db.js';

// export const assignPendingOrders = async (io) => {
//     if (!io) return;
//     const client = await pool.connect();
//     try {
//         await client.query('BEGIN');
//         // Buscamos pedido
//         const orderRes = await client.query(`
//             SELECT p.id, p.total_dolar as monto, u.nombre as cliente_nombre,
//                    dir_o.calle as recogida, dir_d.calle as entrega
//             FROM pedidos p
//             JOIN usuarios u ON p.cliente_id = u.id
//             JOIN direcciones dir_o ON p.direccion_origen_id = dir_o.id
//             JOIN direcciones dir_d ON p.direccion_destino_id = dir_d.id
//             WHERE p.estado = 'pendiente'
//             ORDER BY p.fecha_pedido ASC LIMIT 1 FOR UPDATE SKIP LOCKED
//         `);

//         if (orderRes.rows.length === 0) {
//             await client.query('COMMIT');
//             return;
//         }

//         const pedido = orderRes.rows[0];

//         // Buscamos repartidor (Asegúrate de que el id 20 tenga is_available = true en la DB)
//         const driverRes = await client.query(`
//             SELECT usuario_id FROM repartidores 
//             WHERE is_available = true AND is_active = 'activo'
//             ORDER BY available_since ASC LIMIT 1 FOR UPDATE SKIP LOCKED
//         `);

//         if (driverRes.rows.length === 0) {
//             await client.query('COMMIT');
//             return;
//         }

//         const driverId = driverRes.rows[0].usuario_id;

//         await client.query("UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2", [driverId, pedido.id]);
//         await client.query("UPDATE repartidores SET is_available = false WHERE usuario_id = $1", [driverId]);
//         await client.query('COMMIT');

//         // NOTIFICACIÓN
//         const targetRoom = `driver_${driverId}`;
//         console.log(`📡 Intentando notificar a sala: ${targetRoom}`);

//         io.to(targetRoom).emit('NUEVO_PEDIDO', {
//             pedido_id: pedido.id,
//             monto: pedido.monto,
//             cliente_nombre: pedido.cliente_nombre,
//             recogida: pedido.recogida,
//             entrega: pedido.entrega,
//             estado: 'asignado'
//         });

//     } catch (error) {
//         await client.query('ROLLBACK');
//         console.error("❌ Error en asignación:", error);
//     } finally {
//         client.release();
//     }
// };



