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
            COALESCE(r.is_active, 'pendiente') AS is_active, -- Si es null, lo tratamos como 'pendiente'
            r.documento_identidad,
            r.tipo_documento,
            r.foto,
            r.foto_vehiculo,
            r.tipo_vehiculo_id,
            tv.descript AS tipo_vehiculo
        FROM usuarios u
        LEFT JOIN repartidores r ON u.id = r.usuario_id
        LEFT JOIN tipos_vehiculos tv ON r.tipo_vehiculo_id = tv.id
        WHERE u.tipo = 'repartidor'
        ORDER BY 
            is_active ASC, -- Ordena: activo, pendiente, suspendido (alfabético)
            u.nombre ASC   -- Dentro de cada estatus, ordena por nombre de la A a la Z
    `;
        
        const result = await pool.query(query);
        res.json(result.rows);

    } catch (err) {
        console.error("🔥 ERROR SQL EN GETDRIVERS:", err.message);
        res.status(500).json({ 
            error: "Error al obtener conductores ordenados", 
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