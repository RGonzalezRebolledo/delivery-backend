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
        // 1. Verificamos si el repartidor tiene pedidos activos actualmente
        // Buscamos pedidos asociados al usuario_id que no estén entregados ni finalizados
        const activeOrderCheck = await pool.query(
            `SELECT id FROM pedidos 
             WHERE repartidor_id = $1 
             AND estado IN ('asignado', 'en_camino') 
             LIMIT 1`,
            [usuario_id]
        );

        const hasActiveOrder = activeOrderCheck.rowCount > 0;

        // 2. Ejecutamos la actualización condicional
        // Si tiene pedido: is_available = false (no puede recibir otro)
        // Si NO tiene pedido: is_available = true (entra en la cola FIFO)
        const query = `
            UPDATE repartidores 
            SET is_active = 'activo', 
                is_available = $2,
                available_since = CASE 
                    WHEN $2 = true THEN timezone('America/Caracas', CURRENT_TIMESTAMP) 
                    ELSE available_since 
                END,
                tiene_pedido = $2 -- Sincronizamos también esta bandera por seguridad
            WHERE usuario_id = $1 
            RETURNING *;
        `;
        
        const result = await pool.query(query, [usuario_id, !hasActiveOrder]);

        if (result.rowCount === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'No se encontró el registro del repartidor para este usuario.' 
            });
        }

        const driverData = result.rows[0];

        res.json({
            success: true,
            message: hasActiveOrder 
                ? 'Conductor activado. Se mantiene NO DISPONIBLE porque tiene un pedido en curso.' 
                : 'Conductor activado y posicionado en la cola FIFO.',
            data: driverData,
            hasActiveOrder // Enviamos esta bandera al frontend por si quieres mostrar un aviso
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


