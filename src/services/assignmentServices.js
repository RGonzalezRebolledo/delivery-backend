import { pool } from '../db.js';

export const assignPendingOrders = async (io) => {
    if (!io) return;
    let client;
    
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // 1. Buscamos pedido pendiente
        const orderRes = await client.query(`
            SELECT p.id, p.total_dolar as monto, u.nombre as cliente_nombre,
                   dir_o.calle as recogida, dir_d.calle as entrega
            FROM pedidos p
            JOIN usuarios u ON p.cliente_id = u.id
            JOIN direcciones dir_o ON p.direccion_origen_id = dir_o.id
            JOIN direcciones dir_d ON p.direccion_destino_id = dir_d.id
            WHERE p.estado = 'pendiente'
            ORDER BY p.fecha_pedido ASC
            LIMIT 1 
            FOR UPDATE SKIP LOCKED;
        `);

        if (orderRes.rows.length === 0) {
            await client.query('COMMIT');
            return; 
        }

        const pedido = orderRes.rows[0];

        // 2. Buscamos conductores realmente libres
        // Filtramos por aquellos que NO tengan pedidos en curso en la tabla pedidos
        const driversRes = await client.query(`
            SELECT r.usuario_id 
            FROM repartidores r
            WHERE r.is_available = true 
              AND r.is_active = 'activo'
              AND r.tiene_pedido = false
              AND NOT EXISTS (
                  SELECT 1 FROM pedidos p 
                  WHERE p.repartidor_id = r.usuario_id 
                  AND p.estado IN ('asignado', 'en_camino')
              )
            ORDER BY r.available_since ASC;
        `);

        let selectedDriverId = null;
        for (const driver of driversRes.rows) {
            const socketsInRoom = await io.in(`driver_${driver.usuario_id}`).fetchSockets();
            if (socketsInRoom.length > 0) {
                selectedDriverId = driver.usuario_id;
                break; 
            }
        }

        if (selectedDriverId) {
            // await client.query(
            //     "UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2",
            //     [selectedDriverId, pedido.id]
            // );
            await client.query(
                "UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2 AND estado = 'pendiente'",
                [selectedDriverId, pedido.id]
            );

            await client.query(
                "UPDATE repartidores SET is_available = false, tiene_pedido = true WHERE usuario_id = $1",
                [selectedDriverId]
            );

            await client.query('COMMIT');

            io.to(`driver_${selectedDriverId}`).emit('NUEVO_PEDIDO', {
                pedido_id: pedido.id,
                monto: pedido.monto,
                cliente_nombre: pedido.cliente_nombre,
                recogida: pedido.recogida,
                entrega: pedido.entrega,
                estado: 'asignado'
            });

            console.log(`✅ Pedido #${pedido.id} asignado a Driver #${selectedDriverId}`);
            client.release();
            client = null;
            setTimeout(() => assignPendingOrders(io), 500); 

        } else {
            await client.query('ROLLBACK');
        }

    } catch (error) {
        if (client) try { await client.query('ROLLBACK'); } catch (e) {}
        console.error("❌ Error en assignPendingOrders:", error.message);
    } finally {
        if (client) client.release();
    }
};
// ✅ AHORA RECIBE excludeId PARA REFORZAR LA EXCLUSIÓN
// export const assignPendingOrders = async (io, excludeId = 0) => {
//     if (!io) return;

//     const client = await pool.connect();
    
//     try {
//         await client.query('BEGIN');

//         // 1. Buscamos el pedido pendiente más antiguo.
//         const pendingQuery = `
//             SELECT p.id, p.total_dolar as monto, u.nombre as cliente_nombre,
//                    dir_o.calle as recogida, dir_d.calle as entrega,
//                    p.repartidor_id as ultimo_repartidor
//             FROM pedidos p
//             JOIN usuarios u ON p.cliente_id = u.id
//             JOIN direcciones dir_o ON p.direccion_origen_id = dir_o.id
//             JOIN direcciones dir_d ON p.direccion_destino_id = dir_d.id
//             WHERE p.estado = 'pendiente'
//             ORDER BY p.fecha_pedido ASC
//             LIMIT 1 FOR UPDATE SKIP LOCKED; 
//         `;

//         const orderRes = await client.query(pendingQuery);
//         if (orderRes.rows.length === 0) {
//             await client.query('COMMIT');
//             return;
//         }

//         const pedido = orderRes.rows[0];

//         // ✅ DETERMINAR A QUIÉN EXCLUIR:
//         // Priorizamos el excludeId pasado por el controlador, 
//         // si no, usamos el que está en la tabla pedidos.
//         const driverToExclude = excludeId || pedido.ultimo_repartidor || 0;

//         // 2. Buscamos repartidores disponibles EXCLUYENDO al que rechazó
//         const driversQuery = `
//             SELECT usuario_id FROM repartidores 
//             WHERE is_available = true 
//               AND is_active = 'activo'
//               AND usuario_id != $1
//             ORDER BY available_since ASC;
//         `;

//         const driversRes = await client.query(driversQuery, [driverToExclude]);
        
//         let selectedDriverId = null;

//         // 3. BÚSQUEDA DEL CONDUCTOR CONECTADO
//         for (const driver of driversRes.rows) {
//             const targetRoom = `driver_${driver.usuario_id}`;
//             const socketsInRoom = await io.in(targetRoom).fetchSockets();

//             if (socketsInRoom.length > 0) {
//                 selectedDriverId = driver.usuario_id;
//                 break; 
//             }
//         }

//         if (!selectedDriverId) {
//             await client.query('COMMIT');
//             console.log(`⏳ Pedido #${pedido.id}: No hay otros repartidores disponibles (Excluido: ${driverToExclude}).`);
//             return;
//         }

//         // 4. ACTUALIZACIONES EN DB
//         await client.query(
//             "UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2",
//             [selectedDriverId, pedido.id]
//         );

//         await client.query(
//             "UPDATE repartidores SET is_available = false WHERE usuario_id = $1",
//             [selectedDriverId]
//         );

//         await client.query(
//             "INSERT INTO repartidores_pedidos (repartidor_id, pedido_id) VALUES ($1, $2)",
//             [selectedDriverId, pedido.id]
//         );

//         await client.query('COMMIT');

//         // 5. NOTIFICACIÓN INMEDIATA
//         const targetRoom = `driver_${selectedDriverId}`;
//         io.to(targetRoom).emit('NUEVO_PEDIDO', {
//             pedido_id: pedido.id,
//             monto: pedido.monto,
//             cliente_nombre: pedido.cliente_nombre,
//             recogida: pedido.recogida,
//             entrega: pedido.entrega,
//             estado: 'asignado'
//         });

//         console.log(`✅ REASIGNADO: Pedido #${pedido.id} al usuario ${selectedDriverId}. (Se evitó al usuario ${driverToExclude})`);

//     } catch (error) {
//         if (client) await client.query('ROLLBACK');
//         console.error("❌ ERROR CRÍTICO en assignPendingOrders:", error.message);
//     } finally {
//         client.release();
//     }
// };


