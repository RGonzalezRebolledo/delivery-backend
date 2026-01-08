import { pool } from '../../../db.js';

// --- CONTROLADORES PARA SERVICIOS ---
export const getServices = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipos_servicios WHERE is_active = true ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createService = async (req, res) => {
    const { descript, amount_pay } = req.body;

    try {
        // 1. Verificar si ya existe un vehículo con la misma descripción
        // Usamos ILIKE o UPPER para que la comparación no sea sensible a mayúsculas/minúsculas
        const existingService = await pool.query(
            'SELECT * FROM tipos_servicios WHERE UPPER(descript) = UPPER($1)',
            [descript]
        );

        if (existingService.rows.length > 0) {
            return res.status(400).json({ 
                message: 'El tipo de servicio ya existe.' 
            });
        }

        // 2. Si no existe, proceder con la inserción
        const result = await pool.query(
            'INSERT INTO tipos_servicios (descript, amount_pay) VALUES ($1, $2) RETURNING *',
            [descript, amount_pay]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
