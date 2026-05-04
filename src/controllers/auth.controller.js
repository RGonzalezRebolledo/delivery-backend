import { pool } from '../db.js';
import { assignPendingOrders } from '../services/assignmentServices.js';

export const logoutUser = async (req, res) => {
    const userId = req.userId; 
    const io = req.app.get('socketio');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (userId) {
            // 1. Buscar pedido activo vinculado al id de usuario
            const orderQuery = await client.query(
                `SELECT id, estado FROM pedidos 
                 WHERE repartidor_id = $1 AND estado IN ('asignado', 'en_camino') LIMIT 1`,
                [userId]
            );

            if (orderQuery.rowCount > 0) {
                const pedido = orderQuery.rows[0];

                if (pedido.estado === 'asignado') {
                    // Liberar pedido: vuelve a pendiente y sin repartidor
                    await client.query(
                        `UPDATE pedidos SET estado = 'pendiente', repartidor_id = NULL WHERE id = $1`,
                        [pedido.id]
                    );
                    // Actualizar repartidor: ya no tiene pedido
                    await client.query(
                        `UPDATE repartidores SET tiene_pedido = false WHERE usuario_id = $1`,
                        [userId]
                    );
                } 
                // Si está 'en_camino', NO cambiamos tiene_pedido a false para que lo termine
            } else {
                // Si no hay pedidos activos, aseguramos que el flag esté en false
                await client.query(
                    `UPDATE repartidores SET tiene_pedido = false WHERE usuario_id = $1`,
                    [userId]
                );
            }

            // 2. Desactivar disponibilidad (is_available = false) siempre
            await client.query(
                `UPDATE repartidores SET is_available = false, available_since = NULL WHERE usuario_id = $1`,
                [userId]
            );
        }

        await client.query('COMMIT');

        // 3. Reasignar si liberamos un pedido
        if (io) assignPendingOrders(io);

        // 4. Limpiar cookie
        res.clearCookie('accessToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
        });

        return res.status(200).json({ success: true });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Error en logoutUser:", error);
        return res.status(500).json({ error: "Error al cerrar sesión" });
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

