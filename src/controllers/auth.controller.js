import { pool } from '../db.js';
import { assignPendingOrders } from '../services/assignmentServices.js';

export const logoutUser = async (req, res) => {
    const userId = req.userId; // Este es el 'id' de la tabla 'usuarios'
    const io = req.app.get('socketio');
    const client = await pool.connect();

    try {
        if (!userId) {
            return res.status(401).json({ error: "No se encontró sesión activa." });
        }

        await client.query('BEGIN');

        // 1. Verificamos el estado del pedido directamente con el repartidor_id (usuarios.id)
        const orderQuery = await client.query(
            `SELECT id, estado FROM pedidos 
             WHERE repartidor_id = $1 
             AND estado IN ('asignado', 'en_camino')
             LIMIT 1`,
            [userId]
        );

        if (orderQuery.rowCount > 0) {
            const pedido = orderQuery.rows[0];

            // CASO: El pedido está 'asignado' (todavía no ha sido recogido)
            if (pedido.estado === 'asignado') {
                // Liberamos el pedido para que pase a 'pendiente' y no tenga repartidor
                await client.query(
                    `UPDATE pedidos 
                     SET estado = 'pendiente', repartidor_id = NULL 
                     WHERE id = $1`,
                    [pedido.id]
                );

                // IMPORTANTE: Seteamos 'tiene_pedido' a FALSE en la tabla repartidores
                await client.query(
                    `UPDATE repartidores SET tiene_pedido = false WHERE usuario_id = $1`,
                    [userId]
                );
                
                console.log(`✅ Pedido #${pedido.id} devuelto a pendiente. Repartidor #${userId} liberado.`);
            } 
            // CASO: El pedido está 'en_camino'
            else if (pedido.estado === 'en_camino') {
                // No tocamos nada. 'tiene_pedido' debe seguir siendo TRUE en repartidores.
                console.log(`🛵 Repartidor #${userId} cerró sesión con pedido #${pedido.id} en camino. Se mantiene asignado.`);
            }
        } else {
            // CASO: No tiene pedidos activos. 
            // Forzamos que 'tiene_pedido' sea false por seguridad.
            await client.query(
                `UPDATE repartidores SET tiene_pedido = false WHERE usuario_id = $1`,
                [userId]
            );
        }

        // 2. Desconexión de disponibilidad (Independiente del estado del pedido)
        // Esto asegura que deje de recibir pedidos nuevos y salga de la cola FIFO
        await client.query(
            `UPDATE repartidores 
             SET is_available = false, 
                 available_since = NULL 
             WHERE usuario_id = $1`,
            [userId]
        );

        await client.query('COMMIT');

        // 3. Si liberamos un pedido (pasó a pendiente), intentamos asignarlo a otro disponible
        if (io) {
            assignPendingOrders(io);
        }

        // 4. Limpieza de cookie de acceso
        res.clearCookie('accessToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
        });

        return res.status(200).json({ success: true, message: "Sesión cerrada y disponibilidad desactivada." });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("🔥 Error crítico en logoutUser:", error.message);
        return res.status(500).json({ error: "Error interno al cerrar sesión." });
    } finally {
        client.release();
    }
};

// import { pool } from '../db.js';
// import { assignPendingOrders } from '../services/assignmentServices.js'; // Importación directa preferible

// export const logoutUser = async (req, res) => {
//     const userId = req.userId;
//     const io = req.app.get('socketio');

//     try {
//         if (userId) {
//             // Ponemos al conductor como no disponible ANTES de reasignar
//             await pool.query(
//                 `UPDATE repartidores SET is_available = false, available_since = NULL WHERE usuario_id = $1`,
//                 [userId]
//             );
            
//             // Llamamos a la reasignación pasando el ID del que se va para liberarlo
//             if (io) {
//                 assignPendingOrders(io, userId);
//             }
//         }

//         // Borramos la cookie (Verifica si usas 'token' o 'accessToken')
//         res.clearCookie('accessToken', {
//             httpOnly: true,
//             secure: true,
//             sameSite: 'none',
//         });

//         return res.status(200).json({ success: true, message: "Sesión y disponibilidad cerradas." });

//     } catch (error) {
//         console.error("🔥 Error en logout:", error);
//         return res.status(500).json({ error: "Error al cerrar sesión." });
//     }
// };

