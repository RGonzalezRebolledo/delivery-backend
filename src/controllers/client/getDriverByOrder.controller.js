// En tu archivo de rutas o controlador de clientes
import { pool } from "../../db.js";
export const getDriverByOrder = async (req, res) => {
    const { pedidoId } = req.params;

    try {
        const query = `
            SELECT 
                u.nombre, 
                u.telefono,
                r.usuario_id,
                r.foto, 
                r.foto_vehiculo,
                p.estado
            FROM pedidos p
            JOIN usuarios u ON p.repartidor_id = u.id
            JOIN repartidores r ON u.id = r.usuario_id
            WHERE p.id = $1
        `;

        const result = await pool.query(query, [pedidoId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No hay conductor asignado aún" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error al obtener conductor:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};