import { pool } from '../../db.js';

export const getDrivers = async (req, res) => {
    try {
        const query = `
            SELECT r.*, u.nombre, u.email, tv.descript as vehiculo_descript
            FROM repartidores r
            JOIN usuarios u ON r.usuario_id = u.id
            JOIN tipos_vehiculos tv ON r.tipo_vehiculo_id = tv.id
            WHERE r.verificado = FALSE
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}
