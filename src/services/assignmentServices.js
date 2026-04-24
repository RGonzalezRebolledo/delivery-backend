import { pool } from '../db.js';

export const assignPendingOrders = async (io) => {
    if (!io) {
        console.error("❌ No hay instancia de Socket.io");
        return;
    }

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Buscamos el pedido pendiente más antiguo (Bloqueo de fila para evitar doble asignación)
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

        // 2. Buscamos al repartidor disponible siguiendo la cola FIFO (usuario_id es la clave)
        const driverQuery = `
            SELECT usuario_id FROM repartidores 
            WHERE is_available = true AND is_active = 'activo'
            ORDER BY available_since ASC
            LIMIT 1 FOR UPDATE SKIP LOCKED;
        `;

        const driverRes = await client.query(driverQuery);
        if (driverRes.rows.length === 0) {
            // No hay repartidores: no hacemos nada, el pedido queda pendiente
            await client.query('COMMIT');
            console.log(`⏳ Pedido #${pedido.id} en espera: No hay repartidores disponibles.`);
            return;
        }

        const driverUserId = driverRes.rows[0].usuario_id;

        // 3. ACTUALIZACIONES EN CADENA (Atomicidad total)
        
        // a. Asignamos el pedido al usuario_id del repartidor
        await client.query(
            "UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2",
            [driverUserId, pedido.id]
        );

        // b. Sacamos al repartidor de la cola de disponibilidad
        await client.query(
            "UPDATE repartidores SET is_available = false WHERE usuario_id = $1",
            [driverUserId]
        );

        // c. Insertamos en el historial (según tu nueva tabla)
        await client.query(
            "INSERT INTO repartidores_pedidos (repartidor_id, pedido_id) VALUES ($1, $2)",
            [driverUserId, pedido.id]
        );

        await client.query('COMMIT');

        // --- 4. LÓGICA DE NOTIFICACIÓN ROBUSTA ---
        const targetRoom = `driver_${driverUserId}`;
        
        // Verificamos quién está conectado físicamente antes de enviar
        const socketsInRoom = await io.in(targetRoom).fetchSockets();
        
        console.log("--------------------------------------------------");
        console.log(`📡 INTENTO DE NOTIFICACIÓN - PEDIDO #${pedido.id}`);
        console.log(`📍 Sala: ${targetRoom}`);
        console.log(`👥 Sockets en sala: ${socketsInRoom.length}`);

        if (socketsInRoom.length > 0) {
            io.to(targetRoom).emit('NUEVO_PEDIDO', {
                pedido_id: pedido.id,
                monto: pedido.monto,
                cliente_nombre: pedido.cliente_nombre,
                recogida: pedido.recogida,
                entrega: pedido.entrega,
                estado: 'asignado'
            });
            console.log(`✅ ÉXITO: Card enviada al Dashboard del usuario ${driverUserId}`);
        } else {
            // El conductor está disponible en DB pero cerró la App/Pestaña
            console.error(`❌ FALLO DE ENVÍO: Sala ${targetRoom} VACÍA.`);
            console.error(`💡 El repartidor ${driverUserId} se desconectó físicamente.`);
            
            // OPCIONAL: Podrías revertir la disponibilidad en DB aquí si quieres que 
            // el pedido vuelva a estar libre, pero lo ideal es que el repartidor 
            // lo vea apenas se reconecte mediante el useEffect de carga inicial.
        }
        console.log("--------------------------------------------------");

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("❌ ERROR CRÍTICO en assignPendingOrders:", error.message);
    } finally {
        client.release();
    }
};

// export const assignPendingOrders = async (io) => {
//     if (!io) {
//         console.error("❌ No hay instancia de Socket.io");
//         return;
//     }

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

//         // 2. Buscamos al repartidor disponible
//         const driverQuery = `
//             SELECT usuario_id FROM repartidores 
//             WHERE is_available = true AND is_active = 'activo'
//             ORDER BY available_since ASC
//             LIMIT 1 FOR UPDATE SKIP LOCKED;
//         `;

//         const driverRes = await client.query(driverQuery);
//         if (driverRes.rows.length === 0) {
//             await client.query('COMMIT');
//             return;
//         }

//         const driverId = driverRes.rows[0].usuario_id;

//         // 3. Actualización de DB (Transacción)
//         await client.query(
//             "UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2",
//             [driverId, pedido.id]
//         );

//         await client.query(
//             "UPDATE repartidores SET is_available = false WHERE usuario_id = $1",
//             [driverId]
//         );

//         await client.query('COMMIT');

//         // --- 4. LÓGICA DE NOTIFICACIÓN ROBUSTA ---
//         const targetRoom = `driver_${driverId}`;
        
//         // Verificamos quién está conectado físicamente en este instante
//         const socketsInRoom = await io.in(targetRoom).fetchSockets();
        
//         console.log("--------------------------------------------------");
//         console.log(`📡 INTENTO DE NOTIFICACIÓN`);
//         console.log(`📍 Sala: ${targetRoom}`);
//         console.log(`👥 Sockets activos detectados: ${socketsInRoom.length}`);

//         if (socketsInRoom.length > 0) {
//             io.to(targetRoom).emit('NUEVO_PEDIDO', {
//                 pedido_id: pedido.id,
//                 monto: pedido.monto,
//                 cliente_nombre: pedido.cliente_nombre,
//                 recogida: pedido.recogida,
//                 entrega: pedido.entrega,
//                 estado: 'asignado'
//             });
//             console.log(`✅ EXITO: Pedido ${pedido.id} enviado al conductor ${driverId}`);
//         } else {
//             // Si esto sale en el log, el problema es 100% el Socket del Frontend que se cerró
//             console.error(`❌ FALLO DE ENVÍO: La sala ${targetRoom} está VACÍA.`);
//             console.error(`💡 El conductor ${driverId} se puso disponible en DB pero el Socket se desconectó antes de recibir el mensaje.`);
//         }
//         console.log("--------------------------------------------------");

//     } catch (error) {
//         await client.query('ROLLBACK');
//         console.error("❌ Error Crítico en asignación:", error);
//     } finally {
//         // Liberar el cliente al pool
//         client.release();
//     }
// };
