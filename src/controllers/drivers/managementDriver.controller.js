import { pool } from '../../db.js'; 
// IMPORTANTE: Verifica si assignmentServices.js está realmente en esa ruta
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

// 2. Obtener estado actual (Sincronización para F5)
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

        // Obtenemos pedido activo (asignado o en camino)
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
            tiene_pedido: driver.tiene_pedido, // <-- Usamos guion bajo para ser consistentes con la DB
            status: driver.is_active 
        });
    } catch (error) {
        console.error("Error en getCurrentOrder:", error);
        res.status(500).json({ error: error.message });
    }
};

// 3. Actualizar Estado del Pedido
export const updateOrderStatus = async (req, res) => {
    const { pedido_id, status } = req.body;
    const driverId = req.userId; 
    const io = req.app.get('socketio'); 

    try {
        const pedidoResult = await pool.query("SELECT cliente_id FROM pedidos WHERE id = $1", [pedido_id]);
        if (pedidoResult.rows.length === 0) return res.status(404).json({ success: false });
        const cliente_id = pedidoResult.rows[0].cliente_id;

        if (status === 'entregado' || status === 'pendiente') {
            // Finalizar pedido
            await pool.query(
                `UPDATE pedidos SET estado = $1, fecha_entrega = CASE WHEN $1 = 'entregado' THEN NOW() ELSE NULL END WHERE id = $2`, 
                [status, pedido_id]
            );
            
            // Liberar al repartidor: disponible y sin pedido
            await pool.query(
                `UPDATE repartidores SET is_available = true, tiene_pedido = false WHERE usuario_id = $1`, 
                [driverId]
            );
        } 
        else if (status === 'en_camino') {
            await pool.query(`UPDATE pedidos SET estado = 'en_camino' WHERE id = $1`, [pedido_id]);
            
            // Marcar que tiene pedido pero no está disponible para nuevos envíos
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
// import { pool } from '../../db.js';
// import { assignPendingOrders } from '../../services/assignmentServices.js'; 

// // 1. ACTIVAR/DESACTIVAR DISPONIBILIDAD
// export const toggleAvailability = async (req, res) => {
//     const { available } = req.body;
//     const userId = req.userId;
//     const io = req.app.get('socketio'); 

//     try {
//         // 1. Verificar el estado administrativo del repartidor
//         const checkStatus = await pool.query(
//             "SELECT is_active FROM repartidores WHERE usuario_id = $1",
//             [userId]
//         );

//         if (checkStatus.rows.length === 0) {
//             return res.status(404).json({ error: 'Perfil de repartidor no encontrado' });
//         }

//         const currentStatus = checkStatus.rows[0].is_active;

//         // Bloqueo si el usuario está suspendido
//         if (currentStatus === 'suspendido' && available === true) {
//             return res.status(403).json({ 
//                 success: false, 
//                 message: 'Tu cuenta está suspendida. No puedes ponerte en línea.' 
//             });
//         }

//         // 2. Actualizar disponibilidad en la base de datos
//         // Si se pone disponible (true), grabamos el timestamp para el orden FIFO
//         const query = `
//             UPDATE repartidores 
//             SET is_available = $1, 
//                 available_since = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE NULL END
//             WHERE usuario_id = $2
//             RETURNING is_available;
//         `;
//         const result = await pool.query(query, [available, userId]);
//         const isNowAvailable = result.rows[0].is_available;

//         // 3. LÓGICA DE ASIGNACIÓN AUTOMÁTICA
//         if (isNowAvailable && currentStatus !== 'suspendido') {
//             console.log(`👷 Conductor ${userId} ahora está EN LÍNEA. Verificando cola de pedidos...`);
            
//             /**
//              * Usamos un setTimeout para dar tiempo a que el cliente (Frontend) 
//              * complete el proceso de conexión al Socket y se una a la sala 'driver_ID'
//              * antes de intentar enviarle una notificación de pedido.
//              */
//             setTimeout(() => {
//                 if (io) {
//                     assignPendingOrders(io);
//                 }
//             }, 1500); 
//         }

//         // 4. Respuesta al cliente
//         res.json({
//             success: true,
//             isAvailable: isNowAvailable,
//             message: isNowAvailable 
//                 ? 'Conectado. Buscando pedidos pendientes...' 
//                 : 'Te has desconectado.'
//         });

//     } catch (error) {
//         console.error("❌ Error en toggleAvailability:", error.message);
//         res.status(500).json({ 
//             success: false, 
//             error: 'Error al cambiar disponibilidad del repartidor' 
//         });
//     }
// };

// // 2. OBTENER PEDIDO ACTUAL Y STATUS DEL REPARTIDOR
// export const getCurrentOrder = async (req, res) => {
//     const userId = req.userId; 

//     try {
//         // 1. Verificamos el estado del repartidor
//         const driverQuery = `SELECT is_available, is_active FROM repartidores WHERE usuario_id = $1`;
//         const driverResult = await pool.query(driverQuery, [userId]);

//         if (driverResult.rows.length === 0) {
//             return res.status(404).json({ error: 'Repartidor no encontrado' });
//         }

//         // 2. Buscamos el pedido DIRECTAMENTE en la tabla pedidos
//         // Eliminamos el JOIN innecesario a repartidores para evitar conflictos de ID
//         const orderQuery = `
//             SELECT p.id as pedido_id, p.total_dolar as monto, p.estado,
//                    u_c.nombre as cliente_nombre,
//                    dir_o.calle as recogida, dir_d.calle as entrega
//             FROM pedidos p
//             JOIN usuarios u_c ON p.cliente_id = u_c.id
//             JOIN direcciones dir_o ON p.direccion_origen_id = dir_o.id
//             JOIN direcciones dir_d ON p.direccion_destino_id = dir_d.id
//             WHERE p.repartidor_id = $1 
//               AND p.estado IN ('asignado', 'en_camino')
//             LIMIT 1;
//         `;

//         const orderResult = await pool.query(orderQuery, [userId]);

//         const hasActiveOrder = orderResult.rows.length > 0;
        
//         // Enviamos la respuesta limpia
//         res.json({
//             active: hasActiveOrder,
//             order: hasActiveOrder ? orderResult.rows[0] : null,
//             isAvailableInDB: driverResult.rows[0].is_available,
//             status: driverResult.rows[0].is_active 
//         });

//     } catch (error) {
//         console.error("❌ Error en getCurrentOrder:", error);
//         res.status(500).json({ error: 'Error interno del servidor' });
//     }
// };

// // 3. FINALIZAR PEDIDO
// export const completeOrder = async (req, res) => {
//     const { pedidoId } = req.body;
//     const userId = req.userId;

//     const client = await pool.connect();
//     try {
//         await client.query('BEGIN');

//         const updatePedido = await client.query(
//             "UPDATE pedidos SET estado = 'entregado' WHERE id = $1 AND repartidor_id = $2 RETURNING id",
//             [pedidoId, userId]
//         );

//         if (updatePedido.rows.length === 0) {
//             throw new Error('Pedido no encontrado o no pertenece a este repartidor');
//         }

//         await client.query(
//             "UPDATE repartidores_pedidos SET fecha_entrega = CURRENT_TIMESTAMP WHERE pedido_id = $1",
//             [pedidoId]
//         );

//         await client.query(
//             "UPDATE repartidores SET ultima_entrega_at = CURRENT_TIMESTAMP WHERE usuario_id = $1",
//             [userId]
//         );

//         await client.query('COMMIT');
//         res.json({ success: true, message: '¡Entrega finalizada con éxito!' });
//     } catch (error) {
//         await client.query('ROLLBACK');
//         res.status(500).json({ error: 'Error al finalizar el pedido', details: error.message });
//     } finally {
//         client.release();
//     }
// };

// export const updateOrderStatus = async (req, res) => {
//     const { pedido_id, status } = req.body;
//     const driverId = req.userId; 
//     const io = req.app.get('socketio'); 

//     const client = await pool.connect();

//     try {
//         await client.query("BEGIN");

//         const pedidoResult = await client.query(
//             "SELECT cliente_id FROM pedidos WHERE id = $1",
//             [pedido_id]
//         );

//         if (pedidoResult.rows.length === 0) {
//             throw new Error("Pedido no encontrado");
//         }

//         const cliente_id = pedidoResult.rows[0].cliente_id;

//         if (status === 'pendiente') {
//             // --- EL CONDUCTOR RECHAZÓ O SE LE ACABÓ EL TIEMPO ---
            
//             // ✅ CAMBIO CRÍTICO: No ponemos repartidor_id en NULL. 
//             // Lo dejamos para que assignPendingOrders sepa a quién excluir.
//             await client.query(
//                 `UPDATE pedidos SET estado = 'pendiente' WHERE id = $1`,
//                 [pedido_id]
//             );

//             await client.query(
//                 `UPDATE repartidores 
//                  SET is_available = true, available_since = NOW() 
//                  WHERE usuario_id = $1`,
//                 [driverId]
//             );

//         } else if (status === 'en_camino') {
//             await client.query(
//                 `UPDATE pedidos SET estado = 'en_camino' WHERE id = $1`,
//                 [pedido_id]
//             );

//         } else if (status === 'entregado') {
//             await client.query(
//                 `UPDATE pedidos SET estado = 'entregado', fecha_entrega = NOW() WHERE id = $1`,
//                 [pedido_id]
//             );

//             await client.query(
//                 `UPDATE repartidores 
//                  SET is_available = true, available_since = NOW() 
//                  WHERE usuario_id = $1`,
//                 [driverId]
//             );
//         }

//         await client.query("COMMIT");

//         if (io) {
//             io.to(cliente_id.toString()).emit('ORDEN_ACTUALIZADA', {
//                 pedido_id: pedido_id,
//                 nuevo_estado: status
//             });
//         }

//         if (status === 'pendiente') {
//             console.log(`🔄 Reasignando pedido #${pedido_id}. Excluyendo conductor ${driverId}...`);
//             // ✅ PASAMOS EL driverId para asegurar que no se le asigne a él mismo otra vez
//             assignPendingOrders(io, driverId); 
//         }

//         res.json({ 
//             success: true, 
//             message: `Estado actualizado a ${status}`,
//             cliente_notificado: cliente_id 
//         });

//     } catch (error) {
//         if (client) await client.query("ROLLBACK");
//         console.error("ERROR EN updateOrderStatus:", error.message);
//         res.status(500).json({ success: false, error: error.message });
//     } finally {
//         client.release();
//     }
// };


