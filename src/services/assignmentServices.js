import { pool } from '../db.js';

export const assignPendingOrders = async (io, excludeId = 0) => {
    if (!io) return;

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // --- ⚡️ PASO 0: LIMPIEZA DE SEGURIDAD (ANTI-BLOQUEO) ---
        // Liberamos pedidos 'asignados' cuyos conductores ya no están disponibles 
        // o cuya sesión se cerró, devolviéndolos a 'pendiente'.
        await client.query(`
            UPDATE pedidos 
            SET estado = 'pendiente' 
            WHERE estado = 'asignado' 
            AND (
                repartidor_id IN (SELECT usuario_id FROM repartidores WHERE is_available = false)
                OR repartidor_id = $1
            )
        `, [excludeId]);

        // 1. Buscamos el pedido pendiente más antiguo.
        const pendingQuery = `
            SELECT p.id, p.total_dolar as monto, u.nombre as cliente_nombre,
                   dir_o.calle as recogida, dir_d.calle as entrega,
                   p.repartidor_id as ultimo_repartidor
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
        const driverToExclude = excludeId || pedido.ultimo_repartidor || 0;

        // 2. Buscamos repartidores disponibles 
        const driversQuery = `
            SELECT usuario_id FROM repartidores 
            WHERE is_available = true 
              AND is_active = 'activo'
              AND usuario_id != $1
            ORDER BY available_since ASC;
        `;

        const driversRes = await client.query(driversQuery, [driverToExclude]);
        
        let selectedDriverId = null;

        // 3. BÚSQUEDA DEL CONDUCTOR CONECTADO REAL (Verificación por Socket)
        for (const driver of driversRes.rows) {
            const targetRoom = `driver_${driver.usuario_id}`;
            const socketsInRoom = await io.in(targetRoom).fetchSockets();

            if (socketsInRoom.length > 0) {
                selectedDriverId = driver.usuario_id;
                break; 
            }
        }

        if (!selectedDriverId) {
            await client.query('COMMIT');
            console.log(`⏳ Pedido #${pedido.id}: Sin conductores con socket activo.`);
            return;
        }

        // 4. ACTUALIZACIONES EN DB
        await client.query(
            "UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2",
            [selectedDriverId, pedido.id]
        );

        await client.query(
            "UPDATE repartidores SET is_available = false WHERE usuario_id = $1",
            [selectedDriverId]
        );

        // Registro en histórico (opcional si usas ON CONFLICT)
        await client.query(
            "INSERT INTO repartidores_pedidos (repartidor_id, pedido_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [selectedDriverId, pedido.id]
        );

        await client.query('COMMIT');

        // 5. NOTIFICACIÓN
        io.to(`driver_${selectedDriverId}`).emit('NUEVO_PEDIDO', {
            pedido_id: pedido.id,
            monto: pedido.monto,
            cliente_nombre: pedido.cliente_nombre,
            recogida: pedido.recogida,
            entrega: pedido.entrega,
            estado: 'asignado'
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("❌ ERROR en assignPendingOrders:", error.message);
    } finally {
        client.release();
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


