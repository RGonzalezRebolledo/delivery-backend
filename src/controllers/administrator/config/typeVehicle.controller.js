import { pool } from '../../../db.js';

// --- CONTROLADORES PARA VEHÍCULOS ---
export const getVehicles = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipos_vehiculos WHERE is_active = true ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createVehicle = async (req, res) => {
    const { descript, amount_pay } = req.body;

    try {
        // 1. Verificar si ya existe un vehículo con la misma descripción
        // Usamos ILIKE o UPPER para que la comparación no sea sensible a mayúsculas/minúsculas
        const existingVehicle = await pool.query(
            'SELECT * FROM tipos_vehiculos WHERE UPPER(descript) = UPPER($1)',
            [descript]
        );

        if (existingVehicle.rows.length > 0) {
            return res.status(400).json({ 
                message: 'El tipo de vehículo ya existe.' 
            });
        }

        // 2. Si no existe, proceder con la inserción
        const result = await pool.query(
            'INSERT INTO tipos_vehiculos (descript, amount_pay) VALUES ($1, $2) RETURNING *',
            [descript, amount_pay]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
