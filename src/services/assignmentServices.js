import { pool } from '../db.js';
export const assignPendingOrders = async (io) => {
    if (!io) return;

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Buscamos el pedido pendiente más antiguo. 
        // Traemos también el repartidor_id previo para saber quién lo rechazó.
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
        // Si el repartidor_id es NULL (pedido nuevo), usamos 0 para no filtrar a nadie
        const excludeDriverId = pedido.ultimo_repartidor || 0;

        // 2. Buscamos TODOS los repartidores disponibles.
        // CRÍTICO: Excluimos al conductor que rechazó este pedido específico (usuario_id != $1)
        const driversQuery = `
            SELECT usuario_id FROM repartidores 
            WHERE is_available = true 
              AND is_active = 'activo'
              AND usuario_id != $1
            ORDER BY available_since ASC;
        `;

        const driversRes = await client.query(driversQuery, [excludeDriverId]);
        
        let selectedDriverId = null;

        // 3. BÚSQUEDA DEL CONDUCTOR CONECTADO (Que no sea el que rechazó)
        for (const driver of driversRes.rows) {
            const targetRoom = `driver_${driver.usuario_id}`;
            const socketsInRoom = await io.in(targetRoom).fetchSockets();

            if (socketsInRoom.length > 0) {
                selectedDriverId = driver.usuario_id;
                break; 
            } else {
                console.log(`跳 Saltando conductor ${driver.usuario_id}: Sin conexión activa.`);
            }
        }

        // Si no hay OTROS conductores conectados...
        if (!selectedDriverId) {
            await client.query('COMMIT');
            console.log(`⏳ Pedido #${pedido.id} en espera: No hay otros repartidores conectados distintos al que rechazó.`);
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

        // Opcional: Registrar el intento en el historial
        await client.query(
            "INSERT INTO repartidores_pedidos (repartidor_id, pedido_id) VALUES ($1, $2)",
            [selectedDriverId, pedido.id]
        );

        await client.query('COMMIT');

        // 5. NOTIFICACIÓN INMEDIATA
        const targetRoom = `driver_${selectedDriverId}`;
        io.to(targetRoom).emit('NUEVO_PEDIDO', {
            pedido_id: pedido.id,
            monto: pedido.monto,
            cliente_nombre: pedido.cliente_nombre,
            recogida: pedido.recogida,
            entrega: pedido.entrega,
            estado: 'asignado'
        });

        console.log(`✅ ÉXITO: Pedido #${pedido.id} reasignado al usuario ${selectedDriverId} (Excluido ID anterior: ${excludeDriverId})`);

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("❌ ERROR CRÍTICO en assignPendingOrders:", error.message);
    } finally {
        client.release();
    }
};


// export const assignPendingOrders = async (io) => {
//     if (!io) return;

//     const client = await pool.connect();
    
//     try {
//         await client.query('BEGIN');

//         // 1. Buscamos el pedido pendiente más antiguo
//         const pendingQuery = `
//             SELECT p.id, p.total_dolar as monto, u.nombre as cliente_nombre,
//                    dir_o.calle as recogida, dir_d.calle as entrega
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

//         // 2. Buscamos TODOS los repartidores disponibles (ordenados por antigüedad)
//         // No limitamos a 1 todavía, porque probaremos su conexión uno a uno
//         const driversQuery = `
//             SELECT usuario_id FROM repartidores 
//             WHERE is_available = true AND is_active = 'activo'
//             ORDER BY available_since ASC;
//         `;

//         const driversRes = await client.query(driversQuery);
        
//         let selectedDriverId = null;

//         // 3. BÚSQUEDA DEL CONDUCTOR CONECTADO
//         for (const driver of driversRes.rows) {
//             const targetRoom = `driver_${driver.usuario_id}`;
//             const socketsInRoom = await io.in(targetRoom).fetchSockets();

//             if (socketsInRoom.length > 0) {
//                 selectedDriverId = driver.usuario_id;
//                 break; // ¡Encontramos a uno! Salimos del bucle
//             } else {
//                 console.log(`跳 Saltando conductor ${driver.usuario_id}: Sin conexión activa.`);
//             }
//         }

//         // Si después de revisar todos no hay nadie conectado...
//         if (!selectedDriverId) {
//             await client.query('COMMIT');
//             console.log(`⏳ Pedido #${pedido.id} en espera: No hay repartidores CONECTADOS.`);
//             return;
//         }

//         // 4. ACTUALIZACIONES EN DB (Ahora sí aplicamos los cambios para el seleccionado)
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

//         // 5. NOTIFICACIÓN INMEDIATA (Ya no necesita el setTimeout largo porque ya validamos el socket)
//         const targetRoom = `driver_${selectedDriverId}`;
//         io.to(targetRoom).emit('NUEVO_PEDIDO', {
//             pedido_id: pedido.id,
//             monto: pedido.monto,
//             cliente_nombre: pedido.cliente_nombre,
//             recogida: pedido.recogida,
//             entrega: pedido.entrega,
//             estado: 'asignado'
//         });

//         console.log(`✅ ÉXITO: Pedido #${pedido.id} asignado y enviado al usuario ${selectedDriverId}`);

//     } catch (error) {
//         if (client) await client.query('ROLLBACK');
//         console.error("❌ ERROR CRÍTICO en assignPendingOrders:", error.message);
//     } finally {
//         client.release();
//     }
// };

