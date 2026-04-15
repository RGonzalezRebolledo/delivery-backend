import { pool } from '../../db.js';

export const getDrivers = async (req, res) => {
    try {
        const query = `
            SELECT 
                u.id AS usuario_id, 
                u.nombre, 
                u.email, 
                u.telefono,
                u.tipo,
                u.created_at
            FROM usuarios u
            -- Usamos LEFT JOIN para ver si ya tiene un perfil de repartidor creado
            LEFT JOIN repartidores r ON u.id = r.usuario_id
            WHERE u.tipo = 'repartidor' 
            AND (r.id IS NULL OR r.verificado = FALSE)
            ORDER BY u.created_at DESC;
        `;
        
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener aspirantes:", err.message);
        res.status(500).json({ error: "Error interno al obtener los datos de pre-registro." });
    }
}