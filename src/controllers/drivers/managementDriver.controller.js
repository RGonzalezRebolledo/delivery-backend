import { pool } from '../../db.js';
import { assignPendingOrders } from '../../services/assignmentServices.js'; 

// 1. ACTIVAR/DESACTIVAR DISPONIBILIDAD
export const toggleAvailability = async (req, res) => {
    const { available } = req.body;
    const userId = req.userId;
    const io = req.app.get('socketio'); 

    try {
        const checkStatus = await pool.query(
            "SELECT is_active FROM repartidores WHERE usuario_id = $1",
            [userId]
        );

        if (checkStatus.rows.length === 0) {
            return res.status(404).json({ error: 'Perfil de repartidor no encontrado' });
        }

        const currentStatus = checkStatus.rows[0].is_active;

        if (currentStatus === 'suspendido' && available === true) {
            return res.status(403).json({ 
                success: false, 
                message: 'Tu cuenta está suspendida. No puedes ponerte en línea.' 
            });
        }

        const query = `
            UPDATE repartidores 
            SET is_available = $1, 
                available_since = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE usuario_id = $2
            RETURNING is_available;
        `;
        const result = await pool.query(query, [available, userId]);
        const isNowAvailable = result.rows[0].is_available;

        // 🚀 MEJORA: Retraso de 500ms para asegurar que el socket del frontend 
        // haya tenido tiempo de unirse a la sala 'driver_ID' tras el cambio de estado.
        if (isNowAvailable && currentStatus !== 'suspendido') {
            console.log(`👷 Conductor ${userId} disponible. Buscando pedidos...`);
            
            setTimeout(() => {
                assignPendingOrders(io);
            }, 500); 
        }

        res.json({
            success: true,
            isAvailable: isNowAvailable,
            message: isNowAvailable 
                ? 'Conectado. Buscando pedidos pendientes...' 
                : 'Te has desconectado.'
        });

    } catch (error) {
        console.error("Error en toggleAvailability:", error);
        res.status(500).json({ error: 'Error al cambiar disponibilidad' });
    }
};

// 2. OBTENER PEDIDO ACTUAL Y STATUS DEL REPARTIDOR
export const getCurrentOrder = async (req, res) => {
    const userId = req.userId;

    try {
        const driverQuery = `
            SELECT is_available, is_active 
            FROM repartidores 
            WHERE usuario_id = $1
        `;
        const orderQuery = `
            SELECT p.id as pedido_id, p.total_dolar as monto, p.estado,
                   u.nombre as cliente_nombre,
                   dir_o.calle as recogida, dir_d.calle as entrega,
                   p.municipio_destino as municipio
            FROM pedidos p
            JOIN usuarios u ON p.cliente_id = u.id
            JOIN direcciones dir_o ON p.direccion_origen_id = dir_o.id
            JOIN direcciones dir_d ON p.direccion_destino_id = dir_d.id
            WHERE p.repartidor_id = $1 AND p.estado IN ('asignado', 'en_camino')
            LIMIT 1;
        `;

        const driverResult = await pool.query(driverQuery, [userId]);
        const orderResult = await pool.query(orderQuery, [userId]);

        if (driverResult.rows.length === 0) {
            return res.status(404).json({ error: 'Repartidor no encontrado' });
        }

        const driverData = driverResult.rows[0];
        const hasActiveOrder = orderResult.rows.length > 0;

        res.json({
            active: hasActiveOrder,
            order: hasActiveOrder ? orderResult.rows[0] : null,
            isAvailableInDB: driverData.is_available,
            status: driverData.is_active 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener estado del repartidor' });
    }
};

// 3. FINALIZAR PEDIDO
export const completeOrder = async (req, res) => {
    const { pedidoId } = req.body;
    const userId = req.userId;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const updatePedido = await client.query(
            "UPDATE pedidos SET estado = 'entregado' WHERE id = $1 AND repartidor_id = $2 RETURNING id",
            [pedidoId, userId]
        );

        if (updatePedido.rows.length === 0) {
            throw new Error('Pedido no encontrado o no pertenece a este repartidor');
        }

        await client.query(
            "UPDATE repartidores_pedidos SET fecha_entrega = CURRENT_TIMESTAMP WHERE pedido_id = $1",
            [pedidoId]
        );

        await client.query(
            "UPDATE repartidores SET ultima_entrega_at = CURRENT_TIMESTAMP WHERE usuario_id = $1",
            [userId]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: '¡Entrega finalizada con éxito!' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Error al finalizar el pedido', details: error.message });
    } finally {
        client.release();
    }
};

// import { pool } from '../../db.js';
// import { assignPendingOrders } from '../../services/assignmentServices.js'; // Asegúrate de que la ruta sea correcta

// // 1. ACTIVAR/DESACTIVAR DISPONIBILIDAD
// export const toggleAvailability = async (req, res) => {
//     const { available } = req.body;
//     const userId = req.userId;
//     const io = req.app.get('socketio'); 

//     try {
//         const checkStatus = await pool.query(
//             "SELECT is_active FROM repartidores WHERE usuario_id = $1",
//             [userId]
//         );

//         if (checkStatus.rows.length === 0) {
//             return res.status(404).json({ error: 'Perfil de repartidor no encontrado' });
//         }

//         const currentStatus = checkStatus.rows[0].is_active;

//         // 🛡️ Permitir desconectarse (false), pero bloquear conectarse (true) si está suspendido
//         if (currentStatus === 'suspendido' && available === true) {
//             return res.status(403).json({ 
//                 success: false, 
//                 message: 'Tu cuenta está suspendida. No puedes ponerte en línea.' 
//             });
//         }

//         const query = `
//             UPDATE repartidores 
//             SET is_available = $1, 
//                 available_since = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE NULL END
//             WHERE usuario_id = $2
//             RETURNING is_available;
//         `;
//         const result = await pool.query(query, [available, userId]);
//         const isNowAvailable = result.rows[0].is_available;

//         // 🚀 Lógica de asignación automática (solo si se puso disponible y no está suspendido)
//         if (isNowAvailable && currentStatus !== 'suspendido') {
//             assignPendingOrders(io);
//         }

//         res.json({
//             success: true,
//             isAvailable: isNowAvailable,
//             message: isNowAvailable 
//                 ? 'Conectado. Buscando pedidos pendientes...' 
//                 : 'Te has desconectado.'
//         });

//     } catch (error) {
//         console.error("Error en toggleAvailability:", error);
//         res.status(500).json({ error: 'Error al cambiar disponibilidad' });
//     }
// };

// // 2. OBTENER PEDIDO ACTUAL Y STATUS DEL REPARTIDOR
// export const getCurrentOrder = async (req, res) => {
//     const userId = req.userId;

//     try {
//         // 💡 CONSULTA MULTIPLE: Obtenemos el status del repartidor y su pedido activo (si tiene)
//         const driverQuery = `
//             SELECT is_available, is_active 
//             FROM repartidores 
//             WHERE usuario_id = $1
//         `;
//         const orderQuery = `
//             SELECT p.id as pedido_id, p.total_dolar as monto, p.estado,
//                    u.nombre as cliente_nombre,
//                    dir_o.calle as recogida, dir_d.calle as entrega,
//                    p.municipio_destino as municipio
//             FROM pedidos p
//             JOIN usuarios u ON p.cliente_id = u.id
//             JOIN direcciones dir_o ON p.direccion_origen_id = dir_o.id
//             JOIN direcciones dir_d ON p.direccion_destino_id = dir_d.id
//             WHERE p.repartidor_id = $1 AND p.estado IN ('asignado', 'en_camino')
//             LIMIT 1;
//         `;

//         const driverResult = await pool.query(driverQuery, [userId]);
//         const orderResult = await pool.query(orderQuery, [userId]);

//         if (driverResult.rows.length === 0) {
//             return res.status(404).json({ error: 'Repartidor no encontrado' });
//         }

//         const driverData = driverResult.rows[0];
//         const hasActiveOrder = orderResult.rows.length > 0;

//         // Enviamos todo en una sola respuesta para el Dashboard
//         res.json({
//             active: hasActiveOrder,
//             order: hasActiveOrder ? orderResult.rows[0] : null,
//             isAvailableInDB: driverData.is_available,
//             status: driverData.is_active // 'activo' o 'suspendido'
//         });

//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ error: 'Error al obtener estado del repartidor' });
//     }
// };

// // 3. FINALIZAR PEDIDO
// export const completeOrder = async (req, res) => {
//     const { pedidoId } = req.body;
//     const userId = req.userId;

//     const client = await pool.connect();
//     try {
//         await client.query('BEGIN');

//         // Marcar pedido como entregado
//         const updatePedido = await client.query(
//             "UPDATE pedidos SET estado = 'entregado' WHERE id = $1 AND repartidor_id = $2 RETURNING id",
//             [pedidoId, userId]
//         );

//         if (updatePedido.rows.length === 0) {
//             throw new Error('Pedido no encontrado o no pertenece a este repartidor');
//         }

//         // Registrar fecha de entrega
//         await client.query(
//             "UPDATE repartidores_pedidos SET fecha_entrega = CURRENT_TIMESTAMP WHERE pedido_id = $1",
//             [pedidoId]
//         );

//         // Actualizar última entrega
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

// // import { pool } from '../../db.js';

// // // 1. ACTIVAR/DESACTIVAR DISPONIBILIDAD (Switch del Dashboard)
// // export const toggleAvailability = async (req, res) => {
// //     const { available } = req.body;
// //     const userId = req.userId; // ID del usuario autenticado

// //     try {
// //         const query = `
// //             UPDATE repartidores 
// //             SET is_available = $1, 
// //                 available_since = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE NULL END
// //             WHERE usuario_id = $2
// //             RETURNING is_available;
// //         `;
// //         const result = await pool.query(query, [available, userId]);

// //         res.json({
// //             success: true,
// //             isAvailable: result.rows[0].is_available,
// //             message: available ? 'Ahora estás en la cola de espera.' : 'Te has desconectado de la cola.'
// //         });
// //     } catch (error) {
// //         res.status(500).json({ error: 'Error al cambiar disponibilidad', details: error.message });
// //     }
// // };

// // // 2. OBTENER PEDIDO ACTUAL (Para hidratar el Dashboard al cargar)
// // export const getCurrentOrder = async (req, res) => {
// //     const userId = req.userId;

// //     try {
// //         const query = `
// //             SELECT p.id as pedido_id, p.total_dolar as monto, p.estado,
// //                    u.nombre as cliente_nombre,
// //                    dir_o.calle as recogida, dir_d.calle as entrega,
// //                    p.municipio_destino as municipio
// //             FROM pedidos p
// //             JOIN usuarios u ON p.cliente_id = u.id
// //             JOIN direcciones dir_o ON p.direccion_origen_id = dir_o.id
// //             JOIN direcciones dir_d ON p.direccion_destino_id = dir_d.id
// //             WHERE p.repartidor_id = $1 AND p.estado IN ('asignado', 'en_camino')
// //             LIMIT 1;
// //         `;
// //         const result = await pool.query(query, [userId]);

// //         if (result.rows.length === 0) {
// //             return res.json({ active: false });
// //         }

// //         res.json({ active: true, order: result.rows[0] });
// //     } catch (error) {
// //         res.status(500).json({ error: 'Error al obtener pedido actual' });
// //     }
// // };

// // // 3. FINALIZAR PEDIDO (Entrega exitosa)
// // export const completeOrder = async (req, res) => {
// //     const { pedidoId } = req.body;
// //     const userId = req.userId;

// //     const client = await pool.connect();
// //     try {
// //         await client.query('BEGIN');

// //         // Marcar pedido como entregado
// //         await client.query(
// //             "UPDATE pedidos SET estado = 'entregado' WHERE id = $1 AND repartidor_id = $2",
// //             [pedidoId, userId]
// //         );

// //         // Registrar fecha de entrega en el historial
// //         await client.query(
// //             "UPDATE repartidores_pedidos SET fecha_entrega = CURRENT_TIMESTAMP WHERE pedido_id = $1",
// //             [pedidoId]
// //         );

// //         // Actualizar el historial del repartidor (Opcional, para reportes)
// //         await client.query(
// //             "UPDATE repartidores SET ultima_entrega_at = CURRENT_TIMESTAMP WHERE usuario_id = $1",
// //             [userId]
// //         );

// //         await client.query('COMMIT');
// //         res.json({ success: true, message: '¡Entrega finalizada con éxito!' });
// //     } catch (error) {
// //         await client.query('ROLLBACK');
// //         res.status(500).json({ error: 'Error al finalizar el pedido' });
// //     } finally {
// //         client.release();
// //     }
// // };