import { pool } from '../db.js';
import { assignPendingOrders } from '../services/assignmentServices.js'; // Importación directa preferible

export const logoutUser = async (req, res) => {
    const userId = req.userId;
    const io = req.app.get('socketio');
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        if (userId) {
            // 1. Buscamos y liberamos pedidos en espera de aceptación
            const activeOrder = await client.query(
                `SELECT id FROM pedidos 
                 WHERE repartidor_id = $1 AND estado = 'asignado' 
                 LIMIT 1`,
                [userId]
            );

            if (activeOrder.rows.length > 0) {
                const pedidoId = activeOrder.rows[0].id;
                console.log(`📦 Liberando pedido #${pedidoId} por logout manual del conductor ${userId}`);

                await client.query(
                    `UPDATE pedidos SET estado = 'pendiente' WHERE id = $1`,
                    [pedidoId]
                );
            }

            // 2. IMPORTANTE: Marcar como no disponible para que no se le asigne nada más
            await client.query(
                `UPDATE repartidores 
                 SET is_available = false, available_since = NULL 
                 WHERE usuario_id = $1`,
                [userId]
            );
        }

        await client.query("COMMIT");

        // 3. Limpiar la cookie (Asegúrate que el nombre coincida: 'accessToken')
        res.clearCookie('accessToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
        });

        // 4. Disparar reasignación para que el pedido liberado lo vea alguien más
        if (userId && io) {
            assignPendingOrders(io, userId);
        }

        return res.status(200).json({ 
            success: true, 
            message: "Sesión cerrada. Disponibilidad desactivada y pedidos liberados." 
        });

    } catch (error) {
        if (client) await client.query("ROLLBACK");
        console.error("🔥 Error en logout:", error);
        return res.status(500).json({ error: "Error al cerrar sesión de forma segura." });
    } finally {
        client.release();
    }
};

/*
 * Controlador para cerrar la sesión del usuario.
 * Elimina la cookie 'accessToken' del navegador.


 */
// export const logoutUser = async (req, res) => {
//     try {
//         // 1. Limpiar la cookie 'accessToken'
//         // Usamos res.clearCookie() para decirle al navegador que elimine la cookie.
//         // Es importante pasar el mismo nombre ('accessToken') y, a veces, las mismas
//         // opciones que se usaron al configurarla (excepto maxAge/expires).
//         // res.clearCookie('accessToken', {
//         //     httpOnly: true,
//         //     secure: process.env.NODE_ENV === 'production',
//         //     sameSite: 'Lax',
//         // });

//         res.clearCookie('accessToken', {
//             httpOnly: true,
//             // ⚠️ IMPORTANTE: Estos deben ser idénticos a los del Login/Registro
//             secure: true, 
//             sameSite: 'none', 
//         });

//         // 2. Enviar respuesta de éxito
//         return res.status(200).json({ message: "Sesión cerrada exitosamente." });

//     } catch (error) {
//         console.error("Error al cerrar la sesión:", error);
//         return res.status(500).json({ error: "Ocurrió un error en el servidor al intentar cerrar la sesión." });
//     }
// };