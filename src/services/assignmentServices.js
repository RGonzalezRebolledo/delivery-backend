import { pool } from '../db.js';

export const assignPendingOrders = async (io) => {
    if (!io) return;
    let client;
    
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // 1. Buscamos pedido pendiente con TODOS los datos para la Card
        // Incluimos tipos_servicios para mostrar "MOTO", "EXPRESS", etc.
        const orderRes = await client.query(`
            SELECT 
                p.id, 
                p.total_dolar as monto_usd, 
                p.total as monto_bs,
                p.tipo_vehiculo_id,
                u.nombre as cliente_nombre,
                u.telefono as cliente_telefono,
                ts.descript as tipo_servicio,
                dir_o.calle as recogida, 
                dir_d.calle as entrega
            FROM pedidos p
            JOIN usuarios u ON p.cliente_id = u.id
            JOIN tipos_servicios ts ON p.tipo_servicio_id = ts.id
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

        // 2. Buscamos conductores disponibles que tengan el MISMO TIPO DE VEHÍCULO
        // Importante: p.tipo_vehiculo_id debe coincidir con r.tipo_vehiculo_id
        const driversRes = await client.query(`
            SELECT r.usuario_id 
            FROM repartidores r
            WHERE r.is_available = true 
              AND r.is_active = 'activo'
              AND r.tiene_pedido = false
              AND r.tipo_vehiculo_id = $1
              AND NOT EXISTS (
                  SELECT 1 FROM pedidos p 
                  WHERE p.repartidor_id = r.usuario_id 
                  AND p.estado IN ('asignado', 'en_camino')
              )
            ORDER BY r.available_since ASC;
        `, [pedido.tipo_vehiculo_id]);

        let selectedDriverId = null;
        for (const driver of driversRes.rows) {
            const socketsInRoom = await io.in(`driver_${driver.usuario_id}`).fetchSockets();
            if (socketsInRoom.length > 0) {
                selectedDriverId = driver.usuario_id;
                break; 
            }
        }

        if (selectedDriverId) {
            // 3. Vincular y cambiar estado
            const updateRes = await client.query(
                "UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2 AND estado = 'pendiente' RETURNING id",
                [selectedDriverId, pedido.id]
            );

            if (updateRes.rowCount === 0) {
                await client.query('ROLLBACK');
                return;
            }

            await client.query(
                "UPDATE repartidores SET is_available = false, tiene_pedido = true WHERE usuario_id = $1",
                [selectedDriverId]
            );

            // Registrar en historial como lo haces en createOrder
            await client.query(
                "INSERT INTO repartidores_pedidos (repartidor_id, pedido_id) VALUES ($1, $2)",
                [selectedDriverId, pedido.id]
            );

            await client.query('COMMIT');

            // 4. Notificación Socket con la estructura exacta de tu createOrder
            const payload = {
                pedido_id: pedido.id,
                monto_usd: Number(pedido.monto_usd).toFixed(2),
                monto_bs: Number(pedido.monto_bs).toFixed(2),
                cliente_nombre: pedido.cliente_nombre,
                cliente_telefono: pedido.cliente_telefono,
                tipo_servicio: pedido.tipo_servicio,
                recogida: pedido.recogida,
                entrega: pedido.entrega,
                estado: 'asignado'
            };

            io.to(`driver_${selectedDriverId}`).emit('NUEVO_PEDIDO', payload);

            console.log(`✅ [Reasignación] Pedido #${pedido.id} asignado a Driver #${selectedDriverId}`);
            
            client.release();
            client = null;
            
            // Seguir procesando la cola
            setTimeout(() => assignPendingOrders(io), 500); 

        } else {
            // No hay conductores para ese tipo de vehículo en este momento
            await client.query('ROLLBACK');
        }

    } catch (error) {
        if (client) try { await client.query('ROLLBACK'); } catch (e) {}
        console.error("❌ Error en reasignación FIFO:", error.message);
    } finally {
        if (client) client.release();
    }
};



// import { pool } from '../db.js';

// export const assignPendingOrders = async (io) => {
//     if (!io) return;
//     let client;
    
//     try {
//         client = await pool.connect();
//         await client.query('BEGIN');

//         // 1. Buscamos pedido pendiente
//         const orderRes = await client.query(`
//             SELECT p.id, p.total_dolar as monto, u.nombre as cliente_nombre,
//                    dir_o.calle as recogida, dir_d.calle as entrega
//             FROM pedidos p
//             JOIN usuarios u ON p.cliente_id = u.id
//             JOIN direcciones dir_o ON p.direccion_origen_id = dir_o.id
//             JOIN direcciones dir_d ON p.direccion_destino_id = dir_d.id
//             WHERE p.estado = 'pendiente'
//             ORDER BY p.fecha_pedido ASC
//             LIMIT 1 
//             FOR UPDATE SKIP LOCKED;
//         `);

//         if (orderRes.rows.length === 0) {
//             await client.query('COMMIT');
//             return; 
//         }

//         const pedido = orderRes.rows[0];

//         // 2. Buscamos conductores realmente libres
//         // Filtramos por aquellos que NO tengan pedidos en curso en la tabla pedidos
//         const driversRes = await client.query(`
//             SELECT r.usuario_id 
//             FROM repartidores r
//             WHERE r.is_available = true 
//               AND r.is_active = 'activo'
//               AND r.tiene_pedido = false
//               AND NOT EXISTS (
//                   SELECT 1 FROM pedidos p 
//                   WHERE p.repartidor_id = r.usuario_id 
//                   AND p.estado IN ('asignado', 'en_camino')
//               )
//             ORDER BY r.available_since ASC;
//         `);

//         let selectedDriverId = null;
//         for (const driver of driversRes.rows) {
//             const socketsInRoom = await io.in(`driver_${driver.usuario_id}`).fetchSockets();
//             if (socketsInRoom.length > 0) {
//                 selectedDriverId = driver.usuario_id;
//                 break; 
//             }
//         }

//         if (selectedDriverId) {
//             // await client.query(
//             //     "UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2",
//             //     [selectedDriverId, pedido.id]
//             // );
//             await client.query(
//                 "UPDATE pedidos SET repartidor_id = $1, estado = 'asignado' WHERE id = $2 AND estado = 'pendiente'",
//                 [selectedDriverId, pedido.id]
//             );

//             await client.query(
//                 "UPDATE repartidores SET is_available = false, tiene_pedido = true WHERE usuario_id = $1",
//                 [selectedDriverId]
//             );

//             await client.query('COMMIT');

//             io.to(`driver_${selectedDriverId}`).emit('NUEVO_PEDIDO', {
//                 pedido_id: pedido.id,
//                 monto: pedido.monto,
//                 cliente_nombre: pedido.cliente_nombre,
//                 recogida: pedido.recogida,
//                 entrega: pedido.entrega,
//                 estado: 'asignado'
//             });

//             console.log(`✅ Pedido #${pedido.id} asignado a Driver #${selectedDriverId}`);
//             client.release();
//             client = null;
//             setTimeout(() => assignPendingOrders(io), 500); 

//         } else {
//             await client.query('ROLLBACK');
//         }

//     } catch (error) {
//         if (client) try { await client.query('ROLLBACK'); } catch (e) {}
//         console.error("❌ Error en assignPendingOrders:", error.message);
//     } finally {
//         if (client) client.release();
//     }
// };
