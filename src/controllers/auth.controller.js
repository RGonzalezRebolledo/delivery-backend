import { pool } from '../db.js';
import { assignPendingOrders } from '../services/assignmentServices.js'; // Importación directa preferible

export const logoutUser = async (req, res) => {
    const userId = req.userId;
    const io = req.app.get('socketio');

    try {
        if (userId) {
            // Ponemos al conductor como no disponible ANTES de reasignar
            await pool.query(
                `UPDATE repartidores SET is_available = false, available_since = NULL WHERE usuario_id = $1`,
                [userId]
            );
            
            // Llamamos a la reasignación pasando el ID del que se va para liberarlo
            if (io) {
                assignPendingOrders(io, userId);
            }
        }

        // Borramos la cookie (Verifica si usas 'token' o 'accessToken')
        res.clearCookie('accessToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
        });

        return res.status(200).json({ success: true, message: "Sesión y disponibilidad cerradas." });

    } catch (error) {
        console.error("🔥 Error en logout:", error);
        return res.status(500).json({ error: "Error al cerrar sesión." });
    }
};

// export const logoutUser = async (req, res) => {
//     const userId = req.userId;
//     const io = req.app.get('socketio');
//     const client = await pool.connect();

//     try {
//         await client.query("BEGIN");

//         if (userId) {
//             // 1. Buscamos y liberamos pedidos en espera de aceptación
//             const activeOrder = await client.query(
//                 `SELECT id FROM pedidos 
//                  WHERE repartidor_id = $1 AND estado = 'asignado' 
//                  LIMIT 1`,
//                 [userId]
//             );

//             if (activeOrder.rows.length > 0) {
//                 const pedidoId = activeOrder.rows[0].id;
//                 console.log(`📦 Liberando pedido #${pedidoId} por logout manual del conductor ${userId}`);

//                 await client.query(
//                     `UPDATE pedidos SET estado = 'pendiente' WHERE id = $1`,
//                     [pedidoId]
//                 );
//             }

//             // 2. IMPORTANTE: Marcar como no disponible para que no se le asigne nada más
//             await client.query(
//                 `UPDATE repartidores 
//                  SET is_available = false, available_since = NULL 
//                  WHERE usuario_id = $1`,
//                 [userId]
//             );
//         }

//         await client.query("COMMIT");

//         // 3. Limpiar la cookie (Asegúrate que el nombre coincida: 'accessToken')
//         res.clearCookie('accessToken', {
//             httpOnly: true,
//             secure: true,
//             sameSite: 'none',
//         });

//         // 4. Disparar reasignación para que el pedido liberado lo vea alguien más
//         if (userId && io) {
//             assignPendingOrders(io, userId);
//         }

//         return res.status(200).json({ 
//             success: true, 
//             message: "Sesión cerrada. Disponibilidad desactivada y pedidos liberados." 
//         });

//     } catch (error) {
//         if (client) await client.query("ROLLBACK");
//         console.error("🔥 Error en logout:", error);
//         return res.status(500).json({ error: "Error al cerrar sesión de forma segura." });
//     } finally {
//         client.release();
//     }
// };

