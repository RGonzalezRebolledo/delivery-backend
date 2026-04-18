import { pool } from '../../db.js';

export const getDrivers = async (req, res) => {
    try {
        const query = `
        SELECT 
            u.id AS usuario_id, 
            u.nombre, 
            u.email,
            u.telefono,
            u.fecha_creacion,
            r.id AS repartidor_id,
            r.is_active,
            -- CAMPOS FALTANTES PARA EL MODAL --
            r.documento_identidad,
            r.tipo_documento,
            r.foto,
            r.foto_vehiculo,
            r.tipo_vehiculo_id,
            (SELECT descript FROM tipo_vehiculo WHERE id = r.tipo_vehiculo_id) AS tipo_vehiculo
        FROM usuarios u
        LEFT JOIN repartidores r ON u.id = r.usuario_id
        WHERE u.tipo = 'repartidor'
        ORDER BY 
            CASE 
                WHEN r.id IS NULL THEN 0 -- Los nuevos/pendientes primero
                ELSE 1 
            END, 
            u.fecha_creacion DESC
    `;
        
        const result = await pool.query(query);
        console.log("Conductores enviados al frontend:", result.rows.length);
        res.json(result.rows);

    } catch (err) {
        console.error("🔥 ERROR SQL EN GETDRIVERS:", err.message);
        res.status(500).json({ 
            error: "Error interno en el servidor", 
            details: err.message 
        });
    }
}



// import { pool } from '../../db.js';

// export const getDrivers = async (req, res) => {
//     try {
//         // Consultamos solo lo básico para asegurar que funcione
//         const query = `
//         SELECT 
//             u.id AS usuario_id, 
//             u.nombre, 
//             u.email,
//             u.telefono,
//             u.fecha_creacion,
//             r.id AS repartidor_id,
//             r.is_active -- Este es el campo de tu tabla
//         FROM usuarios u
//         LEFT JOIN repartidores r ON u.id = r.usuario_id
//         WHERE u.tipo = 'repartidor'
//         ORDER BY r.is_active ASC, u.fecha_creacion DESC
//     `;
        
//         const result = await pool.query(query);
//         console.log("Candidatos encontrados:", result.rows.length);
//         res.json(result.rows);

//     } catch (err) {
//         // ESTO ES VITAL: Revisa los logs de Railway para leer este mensaje
//         console.error("🔥 ERROR SQL EN GETDRIVERS:", err.message);
//         res.status(500).json({ 
//             error: "Error interno en el servidor", 
//             details: err.message 
//         });
//     }
// }