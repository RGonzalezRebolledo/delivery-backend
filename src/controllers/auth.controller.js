import { pool } from '../db.js'; // Asegúrate de importar tu pool de conexión

export const logoutUser = async (req, res) => {
    const userId = req.userId;
    const io = req.app.get('socketio');
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        if (userId) {
            // 1. Buscamos si tiene un pedido en estado 'asignado' (esperando aceptación)
            const activeOrder = await client.query(
                `SELECT id FROM pedidos 
                 WHERE repartidor_id = $1 AND estado = 'asignado' 
                 LIMIT 1`,
                [userId]
            );

            if (activeOrder.rows.length > 0) {
                const pedidoId = activeOrder.rows[0].id;
                console.log(`📦 Liberando pedido #${pedidoId} por cierre de sesión del conductor ${userId}`);

                // 2. Devolvemos el pedido a 'pendiente' 
                // Mantenemos el repartidor_id para que la exclusión que hicimos antes funcione
                await client.query(
                    `UPDATE pedidos SET estado = 'pendiente' WHERE id = $1`,
                    [pedidoId]
                );
            }

            // 3. Ponemos al conductor fuera de línea
            await client.query(
                `UPDATE repartidores 
                 SET is_available = false, available_since = NULL 
                 WHERE usuario_id = $1`,
                [userId]
            );
        }

        await client.query("COMMIT");

        // 4. Limpiar la cookie
        res.clearCookie('accessToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
        });

        // 5. Disparar reasignación inmediata si liberamos un pedido
        // Lo hacemos después del COMMIT para que assignPendingOrders vea los cambios
        if (userId) {
            import('../services/assignmentService.js').then(m => m.assignPendingOrders(io, userId));
        }

        return res.status(200).json({ message: "Sesión cerrada y pedidos liberados." });

    } catch (error) {
        if (client) await client.query("ROLLBACK");
        console.error("Error en logout:", error);
        return res.status(500).json({ error: "Error al cerrar sesión." });
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