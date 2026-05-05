import { pool } from "../../db.js";

export const submitRating = async (req, res) => {
    const { pedidoId, estrellas, comentario } = req.body;
    const emisorId = req.userId; // El ID del usuario logueado (Cliente)
    const client = await pool.connect();

    if (!estrellas || estrellas < 1 || estrellas > 5) {
        return res.status(400).json({ error: "La calificación debe estar entre 1 y 5 estrellas" });
    }

    try {
        await client.query("BEGIN");

        // 1. Verificamos que el pedido exista y obtenemos al repartidor (receptor)
        const pedidoRes = await client.query(
            "SELECT repartidor_id FROM pedidos WHERE id = $1 AND cliente_id = $2",
            [pedidoId, emisorId]
        );

        if (pedidoRes.rowCount === 0) {
            throw new Error("El pedido no existe o no tienes permiso para calificarlo.");
        }

        const receptorId = pedidoRes.rows[0].repartidor_id;

        // 2. INSERT en 'calificaciones_pedidos' usando los nombres reales de tu script
        // emisor_id = Cliente, receptor_id = Repartidor
        const insertQuery = `
            INSERT INTO calificaciones_pedidos (
                pedido_id, 
                emisor_id, 
                receptor_id, 
                estrellas, 
                comentario
            )
            VALUES ($1, $2, $3, $4, $5);
        `;
        await client.query(insertQuery, [pedidoId, emisorId, receptorId, estrellas, comentario]);

        // 3. Marcamos el pedido como calificado en la tabla 'pedidos'
        // (Asegúrate de tener esta columna 'calificado' en tu tabla pedidos o ignora este paso)
        await client.query(
            "UPDATE pedidos SET estado = 'finalizado' WHERE id = $1", 
            [pedidoId]
        );

        await client.query("COMMIT");
        res.json({ success: true, message: "Calificación guardada exitosamente" });

    } catch (error) {
        if (client) await client.query("ROLLBACK");
        console.error("❌ Error en submitRating:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message || "Error al procesar la calificación" 
        });
    } finally {
        client.release();
    }
};
// import { pool } from "../../db.js";

// /**
//  * 1. OBTENER PEDIDO PENDIENTE POR CALIFICAR
//  * Busca si el cliente tiene un pedido 'entregado' que aún no ha sido calificado.
//  * Esta función es la que el frontend consulta para mostrar el Modal de bloqueo.
//  */
// export const getPendingRating = async (req, res) => {
//     const usuarioId = req.userId; // ID del cliente desde el middleware de auth

//     try {
//         const query = `
//             SELECT id, total as monto_bs, total_dolar as monto_usd, fecha_pedido
//             FROM pedidos 
//             WHERE cliente_id = $1 
//               AND estado = 'entregado' 
//               AND calificado = false
//             ORDER BY fecha_pedido ASC
//             LIMIT 1;
//         `;
//         const result = await pool.query(query, [usuarioId]);

//         if (result.rows.length > 0) {
//             // Si hay un pedido pendiente, enviamos los datos para el Modal
//             res.json({ tienePendientes: true, pedido: result.rows[0] });
//         } else {
//             // Si todo está al día, el cliente puede navegar libremente
//             res.json({ tienePendientes: false });
//         }
//     } catch (error) {
//         console.error("❌ Error en getPendingRating:", error);
//         res.status(500).json({ error: "Error interno al verificar calificaciones pendientes" });
//     }
// };

// /**
//  * 2. REGISTRAR CALIFICACIÓN
//  * Guarda la puntuación en la tabla 'calificaciones' y libera el pedido en 'pedidos'.
//  */
// export const submitRating = async (req, res) => {
//     const { pedidoId, estrellas, comentario } = req.body;
//     const emisorId = req.userId; // El cliente logueado
//     const client = await pool.connect();

//     // Validación básica de entrada
//     if (!estrellas || estrellas < 1 || estrellas > 5) {
//         return res.status(400).json({ error: "La calificación debe estar entre 1 y 5 estrellas" });
//     }

//     try {
//         await client.query("BEGIN");

//         // A. Buscamos al repartidor_id para registrarlo como receptor_id
//         // Validamos de paso que el pedido pertenezca a este cliente
//         const pedidoRes = await client.query(
//             "SELECT repartidor_id FROM pedidos WHERE id = $1 AND cliente_id = $2",
//             [pedidoId, emisorId]
//         );

//         if (pedidoRes.rowCount === 0) {
//             throw new Error("El pedido no existe o no tienes permiso para calificarlo.");
//         }

//         const receptorId = pedidoRes.rows[0].repartidor_id;

//         // B. Insertar en la tabla 'calificaciones' usando tus nombres de columnas
//         const insertQuery = `
//             INSERT INTO calificaciones (pedido_id, emisor_id, receptor_id, puntuacion, comentario)
//             VALUES ($1, $2, $3, $4, $5);
//         `;
//         await client.query(insertQuery, [pedidoId, emisorId, receptorId, estrellas, comentario]);

//         // C. Marcar el pedido como calificado para que getPendingRating ya no lo devuelva
//         await client.query(
//             "UPDATE pedidos SET calificado = true WHERE id = $1",
//             [pedidoId]
//         );

//         await client.query("COMMIT");
//         res.json({ success: true, message: "¡Gracias por calificar el servicio de Gazzella Express!" });

//     } catch (error) {
//         if (client) await client.query("ROLLBACK");
//         console.error("❌ Error en submitRating:", error);
//         res.status(500).json({ success: false, error: error.message || "Error al procesar la calificación" });
//     } finally {
//         client.release();
//     }
// };