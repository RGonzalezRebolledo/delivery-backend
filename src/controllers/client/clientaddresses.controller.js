// En tu controlador (ej: clientAddresses.controller.js)

import { pool } from '../../db.js';

export const getClientAddresses = async (req, res) => {
    // El ID del cliente se obtiene del token JWT
    const clienteId = req.userId; 

    try {
        const query = `
            SELECT id, calle, ciudad, codigo_postal 
            FROM direcciones 
            WHERE usuario_id = $1
            ORDER BY id DESC;
        `;
        const result = await pool.query(query, [clienteId]);
        
        // Retornar solo las direcciones
        res.status(200).json(result.rows);

    } catch (error) {
        console.error("Error al obtener direcciones del cliente:", error);
        res.status(500).json({ error: 'Error al obtener direcciones guardadas.' });
    }
};