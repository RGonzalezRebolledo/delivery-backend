import { pool } from "../../db.js";

export const getAvailableDrivers = async (req, res) => {
  try {
    const query = `
            SELECT 
                u.id AS usuario_id, 
                u.nombre,
                u.email,
                u.telefono,
                r.id AS repartidor_id,
                r.is_active,
                r.foto,
                tv.descript AS tipo_vehiculo,
                r.available_since
            FROM usuarios u
            INNER JOIN repartidores r ON u.id = r.usuario_id
            INNER JOIN tipos_vehiculos tv ON r.tipo_vehiculo_id = tv.id
            WHERE u.tipo = 'repartidor' 
              AND r.is_available = TRUE 
              AND LOWER(r.is_active) = 'activo'
              AND r.tiene_pedido = FALSE
            -- El que tiene la fecha más vieja (ASC) es el que lleva más tiempo esperando
            ORDER BY r.available_since ASC NULLS LAST
        `;

    const result = await pool.query(query);

    // Enviamos la lista ya ordenada al Front
    res.json(result.rows);
  } catch (err) {
    console.error("🔥 ERROR EN GET_AVAILABLE_DRIVERS:", err.message);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
