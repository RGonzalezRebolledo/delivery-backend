// controllers/drivers/driverActions.controller.js
import { pool } from '../../db.js';

export const suspendDriver = async (req, res) => {
    const { usuario_id } = req.body;

    if (!usuario_id) {
        return res.status(400).json({ error: 'ID de usuario requerido.' });
    }

    try {
        const query = `
            UPDATE repartidores 
            SET is_active = 'suspendido', 
                is_available = false 
            WHERE usuario_id = $1 
            RETURNING *;
        `;
        const result = await pool.query(query, [usuario_id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Repartidor no encontrado.' });
        }

        res.json({
            success: true,
            message: 'Conductor suspendido correctamente',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error al suspender conductor:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};