import { pool } from "../../db.js";

/**
 * Busca si el cliente tiene algún pedido entregado que no haya calificado.
 * Se usa para activar el bloqueo (Modal) en el Dashboard de Gazzella Express.
 */
export const getPendingRating = async (req, res) => {
    const usuarioId = req.userId; // Extraído de tu middleware de auth

    try {
        const query = `
            SELECT id, total as monto_bs, total_dolar as monto_usd, fecha_pedido
            FROM pedidos 
            WHERE cliente_id = $1 
              AND estado = 'entregado' 
              AND calificado = false
            ORDER BY fecha_pedido ASC
            LIMIT 1;
        `;
        const result = await pool.query(query, [usuarioId]);

        if (result.rows.length > 0) {
            res.json({ tienePendientes: true, pedido: result.rows[0] });
        } else {
            res.json({ tienePendientes: false });
        }
    } catch (error) {
        console.error("❌ Error en getPendingRating:", error);
        res.status(500).json({ error: "Error interno al verificar pendientes" });
    }
};

/**
 * Guarda la calificación del cliente y marca el pedido como calificado.
 * Esto "libera" al usuario para seguir usando la app.
 */
export const submitRating = async (req, res) => {
    const { pedidoId, estrellas, comentario } = req.body;
    const client = await pool.connect();

    if (!estrellas || estrellas < 1 || estrellas > 5) {
        return res.status(400).json({ error: "La calificación debe ser entre 1 y 5 estrellas" });
    }

    try {
        await client.query("BEGIN");

        // 1. Insertar la calificación en la tabla correspondiente
        const insertQuery = `
            INSERT INTO calificaciones_pedidos (pedido_id, estrellas, comentario, fecha)
            VALUES ($1, $2, $3, NOW());
        `;
        await client.query(insertQuery, [pedidoId, estrellas, comentario]);

        // 2. Actualizar el pedido para que no vuelva a pedir calificación
        await client.query(
            "UPDATE pedidos SET calificado = true WHERE id = $1",
            [pedidoId]
        );

        await client.query("COMMIT");
        res.json({ success: true, message: "¡Gracias por tu calificación!" });

    } catch (error) {
        if (client) await client.query("ROLLBACK");
        console.error("❌ Error en submitRating:", error);
        res.status(500).json({ success: false, error: "No se pudo procesar la calificación" });
    } finally {
        client.release();
    }
};