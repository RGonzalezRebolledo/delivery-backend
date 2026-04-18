import { pool } from '../../db.js';

export const activateDriver = async (req, res) => {
    const { usuario_id } = req.body;

    if (!usuario_id) {
        return res.status(400).json({ 
            success: false, 
            error: 'El ID de usuario es requerido.' 
        });
    }

    try {
        // Actualizamos el estatus y la marca de tiempo para la cola FIFO
        const query = `
            UPDATE repartidores 
            SET is_active = 'activo', 
                is_available = true,
                available_since = timezone('America/Caracas', CURRENT_TIMESTAMP)
            WHERE usuario_id = $1 
            RETURNING *;
        `;
        
        const result = await pool.query(query, [usuario_id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'No se encontró el registro del repartidor para este usuario.' 
            });
        }

        res.json({
            success: true,
            message: 'Conductor activado y posicionado en la cola FIFO.',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error al activar conductor:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al intentar activar al conductor.' 
        });
    }
};


// import { pool } from '../../db.js';

// export const activateDriver = async (req, res) => {
//     const { usuario_id } = req.body;

//     if (!usuario_id) {
//         return res.status(400).json({ 
//             success: false, 
//             error: 'El ID de usuario es requerido.' 
//         });
//     }

//     try {
//         // Ejecutamos la actualización
//         const query = `
//             UPDATE repartidores 
//             SET is_active = 'activo', 
//                 is_available = true,
//                 is_active = 'activo', 
//                 available_since = CURRENT_TIMESTAMP
//             WHERE usuario_id = $1 
//             RETURNING *;
//         `;
        
//         const result = await pool.query(query, [usuario_id]);

//         if (result.rowCount === 0) {
//             return res.status(404).json({ 
//                 success: false, 
//                 error: 'No se encontró el registro del repartidor.' 
//             });
//         }

//         res.json({
//             success: true,
//             message: 'Conductor activado con éxito',
//             data: result.rows[0]
//         });

//     } catch (error) {
//         console.error('Error al activar conductor:', error);
//         res.status(500).json({ 
//             success: false, 
//             error: 'Error interno al intentar activar al conductor.' 
//         });
//     }
// };