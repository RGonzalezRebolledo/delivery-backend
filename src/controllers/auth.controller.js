import { pool } from '../db.js';
import { assignPendingOrders } from '../services/assignmentServices.js';

export const logoutUser = async (req, res) => {
    const userId = req.userId;
    const io = req.app.get('socketio');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (userId) {
            // 1. Buscamos el pedido activo y verificamos su estado exacto
            const activeOrderCheck = await client.query(
                `SELECT id, estado FROM pedidos 
                 WHERE repartidor_id = $1 AND estado IN ('asignado', 'en_camino')`,
                [userId]
            );

            if (activeOrderCheck.rowCount > 0) {
                const pedido = activeOrderCheck.rows[0];

                // 2. LÓGICA CONDICIONAL:
                if (pedido.estado === 'asignado') {
                    // CASO A: Todavía no ha recogido. Liberamos el pedido.
                    await client.query(
                        `UPDATE pedidos 
                         SET estado = 'pendiente', repartidor_id = NULL 
                         WHERE id = $1`,
                        [pedido.id]
                    );

                    await client.query(
                        `UPDATE repartidores SET tiene_pedido = false WHERE usuario_id = $1`,
                        [userId]
                    );
                    
                    console.log(`📦 Pedido #${pedido.id} REASIGNADO (Logout en estado 'asignado')`);
                } 
                else if (pedido.estado === 'en_camino') {
                    // CASO B: Ya recogió el paquete. NO desvinculamos.
                    // Solo nos aseguramos de que no reciba nada nuevo.
                    console.log(`🛵 Pedido #${pedido.id} PERMANECE con conductor ${userId} (Logout en estado 'en_camino')`);
                }
            }

            // 3. DESCONECTAR DISPONIBILIDAD (Siempre ocurre)
            await client.query(
                `UPDATE repartidores 
                 SET is_available = false, available_since = NULL 
                 WHERE usuario_id = $1`,
                [userId]
            );
        }

        await client.query('COMMIT');

        // 4. Disparar reasignación solo si liberamos algún pedido 'asignado'
        if (io) {
            assignPendingOrders(io);
        }

        // 5. Limpiar Cookie
        res.clearCookie('accessToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
        });

        return res.status(200).json({ 
            success: true, 
            message: "Sesión cerrada correctamente." 
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("🔥 Error en logout:", error);
        return res.status(500).json({ error: "Error al cerrar sesión." });
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

