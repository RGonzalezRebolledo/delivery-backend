import { pool } from '../../db.js';

export const getActiveVehicleTypes = async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT tv.descript
            FROM tipos_vehiculos tv
            INNER JOIN repartidores r ON tv.id = r.tipo_vehiculo_id
            WHERE r.is_active = 'activo' 
              AND r.is_available = TRUE
              AND tv.is_active = TRUE
        `;

        const result = await pool.query(query);
        
        // Convertimos el array de objetos [{descript: 'Moto'}] a un array simple ['Moto']
        const availableVehicles = result.rows.map(row => row.descript);
        
        res.json(availableVehicles);
    } catch (err) {
        console.error("🔥 ERROR AL OBTENER VEHÍCULOS ACTIVOS:", err.message);
        res.status(500).json({ 
            error: "Error al validar disponibilidad de vehículos",
            details: err.message 
        });
    }
};