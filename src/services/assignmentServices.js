import { pool } from '../db.js';

export const assignPendingOrders = async (io) => {
    if (!io) return;

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

        const orderRes = await client.query(pendingQuery);
        if (orderRes.rows.length === 0) {
            await client.query('COMMIT');
            return;
        }

        const pedido = orderRes.rows[0];

        // 2. Buscamos TODOS los repartidores disponibles (ordenados por antigüedad)
        // No limitamos a 1 todavía, porque probaremos su conexión uno a uno
        const driversQuery = `
            SELECT usuario_id FROM repartidores 
            WHERE is_available = true AND is_active = 'activo'
            ORDER BY available_since ASC;
        `;

        const driversRes = await client.query(driversQuery);
        
        let selectedDriverId = null;

        // 3. BÚSQUEDA DEL CONDUCTOR CONECTADO
        for (const driver of driversRes.rows) {
            const targetRoom = `driver_${driver.usuario_id}`;
            const socketsInRoom = await io.in(targetRoom).fetchSockets();

            if (socketsInRoom.length > 0) {
                selectedDriverId = driver.usuario_id;
                break; // ¡Encontramos a uno! Salimos del bucle
            } else {
                console.log(`跳 Saltando conductor ${driver.usuario_id}: Sin conexión activa.`);
            }
        }

        // Si después de revisar todos no hay nadie conectado...
        if (!selectedDriverId) {
            await client.query('COMMIT');
            console.log(`⏳ Pedido #${pedido.id} en espera: No hay repartidores CONECTADOS.`);
            return;
        }

        // 4. ACTUALIZACIONES EN DB (Ahora sí aplicamos los cambios para el seleccionado)
        await client.query(
            "UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2",
            [selectedDriverId, pedido.id]
        );

        await client.query(
            "UPDATE repartidores SET is_available = false WHERE usuario_id = $1",
            [selectedDriverId]
        );

        await client.query(
            "INSERT INTO repartidores_pedidos (repartidor_id, pedido_id) VALUES ($1, $2)",
            [selectedDriverId, pedido.id]
        );

        await client.query('COMMIT');

        // 5. NOTIFICACIÓN INMEDIATA (Ya no necesita el setTimeout largo porque ya validamos el socket)
        const targetRoom = `driver_${selectedDriverId}`;
        io.to(targetRoom).emit('NUEVO_PEDIDO', {
            pedido_id: pedido.id,
            monto: pedido.monto,
            cliente_nombre: pedido.cliente_nombre,
            recogida: pedido.recogida,
            entrega: pedido.entrega,
            estado: 'asignado'
        });

        console.log(`✅ ÉXITO: Pedido #${pedido.id} asignado y enviado al usuario ${selectedDriverId}`);

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

//         // 1. Buscamos el pedido pendiente más antiguo (Bloqueo de fila)
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

//         // 2. Buscamos al repartidor disponible (FIFO)
//         const driverQuery = `
//             SELECT usuario_id FROM repartidores 
//             WHERE is_available = true AND is_active = 'activo'
//             ORDER BY available_since ASC
//             LIMIT 1 FOR UPDATE SKIP LOCKED;
//         `;

//         const driverRes = await client.query(driverQuery);
//         if (driverRes.rows.length === 0) {
//             await client.query('COMMIT');
//             console.log(`⏳ Pedido #${pedido.id} en espera: No hay repartidores disponibles.`);
//             return;
//         }

//         const driverUserId = driverRes.rows[0].usuario_id;

//         // 3. ACTUALIZACIONES EN DB
        
//         // a. Asignar pedido
//         await client.query(
//             "UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2",
//             [driverUserId, pedido.id]
//         );

//         // b. Cambiar disponibilidad
//         await client.query(
//             "UPDATE repartidores SET is_available = false WHERE usuario_id = $1",
//             [driverUserId]
//         );

//         // c. Registrar en historial
//         await client.query(
//             "INSERT INTO repartidores_pedidos (repartidor_id, pedido_id) VALUES ($1, $2)",
//             [driverUserId, pedido.id]
//         );

//         await client.query('COMMIT');

//         // --- 4. LÓGICA DE NOTIFICACIÓN ROBUSTA CON RETRASO ---
//         // Usamos setTimeout para asegurar que la transacción en DB se haya propagado
//         // y que el Frontend no reciba datos antes de que la DB esté lista.
//         setTimeout(async () => {
//             const targetRoom = `driver_${driverUserId}`;
//             const socketsInRoom = await io.in(targetRoom).fetchSockets();
            
//             console.log("--------------------------------------------------");
//             console.log(`📡 INTENTO DE NOTIFICACIÓN - PEDIDO #${pedido.id}`);
//             console.log(`👥 Sockets en sala ${targetRoom}: ${socketsInRoom.length}`);

//             if (socketsInRoom.length > 0) {
//                 // NORMALIZACIÓN: Enviamos los campos exactos que espera el Dashboard
//                 io.to(targetRoom).emit('NUEVO_PEDIDO', {
//                     pedido_id: pedido.id,
//                     monto: pedido.monto,
//                     cliente_nombre: pedido.cliente_nombre,
//                     recogida: pedido.recogida,
//                     entrega: pedido.entrega,
//                     estado: 'asignado'
//                 });
//                 console.log(`✅ ÉXITO: Evento enviado al usuario ${driverUserId}`);
//             } else {
//                 console.error(`❌ FALLO: El usuario ${driverUserId} no tiene sockets activos en la sala.`);
//             }
//             console.log("--------------------------------------------------");
//         }, 300); // 300ms de margen de seguridad

//     } catch (error) {
//         if (client) await client.query('ROLLBACK');
//         console.error("❌ ERROR CRÍTICO en assignPendingOrders:", error.message);
//     } finally {
//         client.release();
//     }
// };


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
