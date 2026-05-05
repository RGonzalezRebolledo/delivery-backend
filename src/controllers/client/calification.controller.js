import { pool } from "../../db.js";

/**
 * Busca si el cliente tiene algún pedido entregado que aún no ha sido calificado.
 * Según tu script, usamos 'cliente_id' y el estado 'entregado'.
 */
export const getPendingRating = async (req, res) => {
    const clienteId = req.userId; 

    try {
        // Buscamos pedidos en estado 'entregado'. 
        // Nota: Si no tienes la columna 'calificado' en la tabla 'pedidos', 
        // hacemos un LEFT JOIN con la tabla de calificaciones para ver cuáles faltan.
        const query = `
            SELECT p.id, p.total, p.total_dolar, p.fecha_pedido
            FROM pedidos p
            LEFT JOIN calificaciones_pedidos c ON p.id = c.pedido_id
            WHERE p.cliente_id = $1 
              AND p.estado = 'entregado'
              AND c.id IS NULL
            ORDER BY p.fecha_pedido ASC
            LIMIT 1;
        `;
        
        const result = await pool.query(query, [clienteId]);

        if (result.rows.length > 0) {
            res.json({ 
                tienePendientes: true, 
                pedido: result.rows[0] 
            });
        } else {
            res.json({ tienePendientes: false });
        }
    } catch (error) {
        console.error("❌ Error en getPendingRating:", error);
        res.status(500).json({ error: "Error al verificar pedidos pendientes de calificación" });
    }
};

/**
 * Guarda la calificación en la base de datos.
 * Basado en tu script: emisor_id (cliente) y receptor_id (repartidor).
 */

export const submitRating = async (req, res) => {
    // Recibimos los datos del RatingModal
    const { pedido_id, estrellas, comentario, isDriverRatingClient } = req.body;
    const userId = req.userId; // El ID del usuario autenticado (emisor)

    try {
        // 1. Buscamos el pedido en la tabla 'pedidos' para validar existencia
        const pedidoRes = await pool.query(
            "SELECT id, cliente_id, repartidor_id FROM pedidos WHERE id = $1",
            [pedido_id]
        );

        if (pedidoRes.rowCount === 0) {
            return res.status(404).json({ error: "Pedido no encontrado." });
        }

        const pedido = pedidoRes.rows[0];

        // 2. Lógica Dinámica de Receptor
        // Si el que califica es el repartidor, el receptor es el cliente_id.
        // Si el que califica es el cliente, el receptor es el repartidor_id.
        let receptor_id;
        if (isDriverRatingClient) {
            receptor_id = pedido.cliente_id;
        } else {
            receptor_id = pedido.repartidor_id;
        }

        // 3. Insertar en 'calificaciones_pedidos'
        await pool.query(
            `INSERT INTO calificaciones_pedidos 
            (pedido_id, emisor_id, receptor_id, estrellas, comentario) 
            VALUES ($1, $2, $3, $4, $5)`,
            [pedido_id, userId, receptor_id, estrellas, comentario]
        );

        res.json({ success: true, message: "Calificación guardada" });

    } catch (error) {
        console.error("❌ Error en submitRating:", error);
        res.status(500).json({ error: "Error al procesar calificación" });
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