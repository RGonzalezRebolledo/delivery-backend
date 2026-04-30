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
        // 1. Verificamos si tiene pedidos en curso
        const activeOrderCheck = await pool.query(
            `SELECT id FROM pedidos 
             WHERE repartidor_id = $1 
             AND estado IN ('asignado', 'en_camino') 
             LIMIT 1`,
            [usuario_id]
        );

        const hasActiveOrder = activeOrderCheck.rowCount > 0;

        // 2. Actualizamos con la lógica correcta:
        // is_available: Solo true si NO tiene pedidos (para no asignarle otro).
        // tiene_pedido: DEBE SER TRUE si encontramos un pedido en el paso 1.
        const query = `
            UPDATE repartidores 
            SET is_active = 'activo', 
                is_available = $2, 
                tiene_pedido = $3, 
                available_since = CASE 
                    WHEN $2 = true THEN timezone('America/Caracas', CURRENT_TIMESTAMP) 
                    ELSE available_since 
                END
            WHERE usuario_id = $1 
            RETURNING *;
        `;
        
        // Explicación de parámetros:
        // $2 (is_available) -> !hasActiveOrder (Si tiene pedido, no está disponible para nuevos)
        // $3 (tiene_pedido) -> hasActiveOrder  (Si tiene pedido, marcamos que tiene uno)
        const result = await pool.query(query, [usuario_id, !hasActiveOrder, hasActiveOrder]);

        if (result.rowCount === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'No se encontró el registro del repartidor.' 
            });
        }

        res.json({
            success: true,
            message: hasActiveOrder 
                ? 'Conductor activado. El pedido actual debería aparecer en su panel.' 
                : 'Conductor activado y disponible para recibir pedidos.',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error al activar conductor:', error);
        res.status(500).json({ success: false, error: 'Error interno.' });
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
//         // Actualizamos el estatus y la marca de tiempo para la cola FIFO
//         const query = `
//             UPDATE repartidores 
//             SET is_active = 'activo', 
//                 is_available = true,
//                 available_since = timezone('America/Caracas', CURRENT_TIMESTAMP)
//             WHERE usuario_id = $1 
//             RETURNING *;
//         `;
        
//         const result = await pool.query(query, [usuario_id]);

//         if (result.rowCount === 0) {
//             return res.status(404).json({ 
//                 success: false, 
//                 error: 'No se encontró el registro del repartidor para este usuario.' 
//             });
//         }

//         res.json({
//             success: true,
//             message: 'Conductor activado y posicionado en la cola FIFO.',
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


