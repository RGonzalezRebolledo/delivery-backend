import { pool } from '../../db.js';

export const getDrivers = async (req, res) => {
    try {
        // Consultamos solo lo básico para asegurar que funcione
        const query = `
            SELECT 
                u.id AS usuario_id, 
                u.nombre, 
                u.email,
                u.tipo
            FROM usuarios u
            LEFT JOIN repartidores r ON u.id = r.usuario_id
            WHERE u.tipo = 'repartidor' 
            AND (r.id IS NULL OR r.verificado = FALSE)
        `;
        
        const result = await pool.query(query);
        console.log("Candidatos encontrados:", result.rows.length);
        res.json(result.rows);

    } catch (err) {
        // ESTO ES VITAL: Revisa los logs de Railway para leer este mensaje
        console.error("🔥 ERROR SQL EN GETDRIVERS:", err.message);
        res.status(500).json({ 
            error: "Error interno en el servidor", 
            details: err.message 
        });
    }
}