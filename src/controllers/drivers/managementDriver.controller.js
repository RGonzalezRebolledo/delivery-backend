import { pool } from '../../db.js';
import { assignPendingOrders } from '../../services/assignmentServices.js'; 

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
        if (result.rows[0].is_available && io) assignPendingOrders(io);

        res.json({ success: true, isAvailable: result.rows[0].is_available });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getCurrentOrder = async (req, res) => {
    const userId = req.userId; 
    try {
        const driverResult = await pool.query(`SELECT is_available, is_active FROM repartidores WHERE usuario_id = $1`, [userId]);
        
        // ⚡️ Optimización: Solo traer pedidos que pertenezcan al driver y estén en estados activos
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
            isAvailableInDB: driverResult.rows[0]?.is_available,
            status: driverResult.rows[0]?.is_active 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// En tu controlador de driver
export const completeOrder = async (req, res) => {
    const { pedidoId } = req.body;
    const userId = req.userId;
    const io = req.app.get('socketio');
    const client = await pool.connect();

    console.log(`--- INTENTO DE COMPLETAR PEDIDO ---`);
    console.log(`Driver ID: ${userId} | Pedido ID: ${pedidoId}`);

    try {
        await client.query("BEGIN");

        // 1. Forzamos la actualización del pedido sin importar el estado previo
        // Solo verificamos que el pedido sea de este repartidor
        const orderRes = await client.query(
            `UPDATE pedidos 
             SET estado = 'entregado', fecha_entrega = NOW() 
             WHERE id = $1 AND repartidor_id = $2
             RETURNING id, estado`, 
            [pedidoId, userId]
        );

        console.log(`Resultado Pedido: ${orderRes.rowCount > 0 ? 'EXITO' : 'FALLO - No encontrado o no es del driver'}`);

        // 2. FORZAMOS la disponibilidad del repartidor
        const driverRes = await client.query(
            `UPDATE repartidores 
             SET is_available = true, available_since = NOW() 
             WHERE usuario_id = $1
             RETURNING is_available`, 
            [userId]
        );

        console.log(`Resultado Disponibilidad Driver: ${driverRes.rowCount > 0 ? 'EXITO' : 'FALLO - No existe el registro en la tabla repartidores'}`);

        await client.query("COMMIT");

        if (orderRes.rowCount > 0 && driverRes.rowCount > 0) {
            console.log(`✅ DISPONIBILIDAD ACTIVADA PARA DRIVER ${userId}`);
            if (io) assignPendingOrders(io);
            return res.json({ success: true, message: "Ahora estás disponible" });
        } else {
            throw new Error("No se pudo actualizar una de las tablas");
        }

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("🔥 ERROR EN COMPLETE_ORDER:", error.message);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
};

export const updateOrderStatus = async (req, res) => {
    const { pedido_id, status } = req.body;
    const driverId = req.userId; 
    const io = req.app.get('socketio'); 

    try {
        // 1. Verificar que el pedido existe y obtener el cliente
        const pedidoResult = await pool.query(
            "SELECT cliente_id FROM pedidos WHERE id = $1", 
            [pedido_id]
        );
        
        if (pedidoResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Pedido no encontrado" });
        }

        const cliente_id = pedidoResult.rows[0].cliente_id;

        if (status === 'pendiente') {
            /**
             * ⚡️ LÓGICA DE RECHAZO CORREGIDA
             * El conductor rechaza, pero se mantiene disponible para OTROS pedidos.
             */
            
            // A. Liberamos el pedido: lo devolvemos a la cola general
            await pool.query(
                `UPDATE pedidos 
                 SET estado = 'pendiente', 
                     repartidor_id = NULL 
                 WHERE id = $1`, 
                [pedido_id]
            );
            
            // B. MANTENER AL REPARTIDOR DISPONIBLE
            // Seteamos is_available = true y reiniciamos available_since para que
            // el sistema lo ponga al final de la lista de prioridad (FIFO).
            await pool.query(
                `UPDATE repartidores 
                 SET is_available = true, 
                     available_since = NOW() 
                 WHERE usuario_id = $1`, 
                [driverId]
            );

            // C. Registrar el rechazo (opcional, para que el motor sepa que este ya lo rechazó)
            await pool.query(
                `INSERT INTO repartidores_pedidos (pedido_id, repartidor_id, fecha_asignacion)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT (pedido_id, repartidor_id) DO NOTHING`,
                [pedido_id, driverId]
            );

            console.log(`⚠️ Conductor ${driverId} rechazó pedido #${pedido_id} pero sigue disponible.`);

        } else {
            /**
             * ✅ LÓGICA DE CAMBIO DE ESTADO NORMAL
             */
            await pool.query(
                `UPDATE pedidos SET estado = $1 WHERE id = $2`, 
                [status, pedido_id]
            );
        }

        // 2. Notificaciones y Reasignación
        if (io) {
            // Notificar al cliente
            io.to(cliente_id.toString()).emit('ORDEN_ACTUALIZADA', {
                pedido_id: parseInt(pedido_id),
                nuevo_estado: status
            });

            // Si fue rechazo, buscamos inmediatamente a OTRO conductor para este pedido
            if (status === 'pendiente') {
                assignPendingOrders(io);
            }
        }

        res.json({ 
            success: true, 
            message: status === 'pendiente' ? "Pedido liberado, sigues en línea para otros pedidos" : "Estado actualizado" 
        });

    } catch (error) {
        console.error("🔥 Error en updateOrderStatus:", error.message);
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


