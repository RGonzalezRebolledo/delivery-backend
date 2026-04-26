import { pool } from '../../db.js';
import { assignPendingOrders } from '../../services/assignmentServices.js'; 

// 1. Cambiar Disponibilidad (Switch Manual)
export const toggleAvailability = async (req, res) => {
    const { available } = req.body;
    const userId = req.userId;
    const io = req.app.get('socketio'); 

    try {
        const query = `
            UPDATE repartidores 
            SET is_available = $1, 
                available_since = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE usuario_id = $2
            RETURNING is_available;
        `;
        const result = await pool.query(query, [available, userId]);
        
        if (result.rows[0]?.is_available && io) {
            assignPendingOrders(io);
        }

        res.json({ 
            success: true, 
            isAvailable: result.rows[0]?.is_available 
        });
    } catch (error) {
        console.error("Error en toggleAvailability:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// 2. Obtener estado actual (Para el F5 / Persistencia)
export const getCurrentOrder = async (req, res) => {
    const userId = req.userId; 
    try {
        // Obtenemos datos del repartidor
        const driverRes = await pool.query(
            `SELECT is_available, is_active, tiene_pedido FROM repartidores WHERE usuario_id = $1`, 
            [userId]
        );
        
        if (driverRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Repartidor no encontrado" });
        }

        const driver = driverRes.rows[0];

        // Obtenemos pedido activo si existe
        const orderQuery = `
            SELECT p.id as pedido_id, p.total_dolar as monto, p.estado,
                   u_c.nombre as cliente_nombre,
                   dir_o.calle as recogida, dir_d.calle as entrega
            FROM pedidos p
            JOIN usuarios u_c ON p.cliente_id = u_c.id
            JOIN direcciones dir_o ON p.direccion_origen_id = dir_o.id
            JOIN direcciones dir_d ON p.direccion_destino_id = dir_d.id
            WHERE p.repartidor_id = $1 
              AND p.estado IN ('asignado', 'en_camino')
            LIMIT 1;
        `;
        const orderResult = await pool.query(orderQuery, [userId]);
        
        res.json({
            active: orderResult.rows.length > 0,
            order: orderResult.rows[0] || null,
            isAvailableInDB: driver.is_available,
            tienePedido: driver.tiene_pedido, // Campo clave
            status: driver.is_active 
        });
    } catch (error) {
        console.error("Error en getCurrentOrder:", error);
        res.status(500).json({ error: error.message });
    }
};

// 3. Actualizar Estado del Pedido (Ruta / Entrega)
export const updateOrderStatus = async (req, res) => {
    const { pedido_id, status } = req.body;
    const driverId = req.userId; 
    const io = req.app.get('socketio'); 

    try {
        const pedidoResult = await pool.query("SELECT cliente_id FROM pedidos WHERE id = $1", [pedido_id]);
        if (pedidoResult.rows.length === 0) return res.status(404).json({ success: false });
        const cliente_id = pedidoResult.rows[0].cliente_id;

        if (status === 'entregado' || status === 'pendiente') {
            // Caso: Conductor termina el pedido
            await pool.query(
                `UPDATE pedidos SET estado = $1, fecha_entrega = CASE WHEN $1 = 'entregado' THEN NOW() ELSE NULL END WHERE id = $2`, 
                [status, pedido_id]
            );
            
            // Liberación total: disponible para el sistema y sin pedido asignado
            await pool.query(
                `UPDATE repartidores SET is_available = true, tiene_pedido = false WHERE usuario_id = $1`, 
                [driverId]
            );
        } 
        else if (status === 'en_camino') {
            await pool.query(`UPDATE pedidos SET estado = 'en_camino' WHERE id = $1`, [pedido_id]);
            
            // Sigue teniendo pedido, pero is_available false para que no le caigan otros
            await pool.query(
                `UPDATE repartidores SET tiene_pedido = true, is_available = false WHERE usuario_id = $1`, 
                [driverId]
            );
        }

        if (io) {
            io.to(cliente_id.toString()).emit('ORDEN_ACTUALIZADA', { pedido_id, nuevo_estado: status });
            if (status === 'entregado' || status === 'pendiente') assignPendingOrders(io);
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error en updateOrderStatus:", error);
        res.status(500).json({ success: false, error: error.message });
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


