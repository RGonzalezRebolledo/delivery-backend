import { pool } from '../../db.js';

export const registerDriverInterview = async (req, res) => {
    const { 
        usuario_id, 
        documento_identidad, 
        tipo_documento, 
        tipo_vehiculo_id, 
        foto, 
        foto_vehiculo 
    } = req.body;

    // 1. Validación de campos obligatorios
    if (!usuario_id || !documento_identidad || !tipo_vehiculo_id || !foto || !foto_vehiculo) {
        return res.status(400).json({ 
            success: false,
            error: 'Faltan datos obligatorios. Asegúrese de que ambas fotos se hayan subido correctamente.' 
        });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 2. Insertar o actualizar en la tabla 'repartidores'
        // Se añade available_since para la cola FIFO
        const driverQuery = `
            INSERT INTO repartidores (
                usuario_id, 
                documento_identidad, 
                tipo_documento, 
                tipo_vehiculo_id, 
                foto, 
                foto_vehiculo, 
                is_active, 
                is_available,
                available_since
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8,timezone('America/Caracas', CURRENT_TIMESTAMP))
            ON CONFLICT (usuario_id) 
            DO UPDATE SET 
                documento_identidad = EXCLUDED.documento_identidad,
                tipo_documento = EXCLUDED.tipo_documento,
                tipo_vehiculo_id = EXCLUDED.tipo_vehiculo_id,
                foto = EXCLUDED.foto,
                foto_vehiculo = EXCLUDED.foto_vehiculo,
                is_active = 'activo',
                available_since = timezone('America/Caracas', CURRENT_TIMESTAMP)
            RETURNING *;
        `;

        const driverValues = [
            usuario_id, 
            documento_identidad, 
            tipo_documento, 
            tipo_vehiculo_id, 
            foto, 
            foto_vehiculo,
            'activo', 
            false // Se registra pero inicia como NO disponible hasta que se ponga "En línea"
        ];

        const driverResult = await client.query(driverQuery, driverValues);

        // 3. Actualizar el rol del usuario en la tabla general de usuarios
        await client.query(
            'UPDATE usuarios SET tipo = $1 WHERE id = $2',
            ['repartidor', usuario_id]
        );

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            message: 'Conductor registrado y posicionado en cola con éxito',
            data: driverResult.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en registerDriverInterview:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno al procesar el registro del conductor.' 
        });
    } finally {
        client.release();
    }
};



// import { pool } from '../../db.js';

// export const registerDriverInterview = async (req, res) => {
//     const { 
//         usuario_id, 
//         documento_identidad, 
//         tipo_documento, 
//         tipo_vehiculo_id, 
//         foto, 
//         foto_vehiculo 
//     } = req.body;

//     // 1. Validación de campos obligatorios
//     if (!usuario_id || !documento_identidad || !tipo_vehiculo_id || !foto || !foto_vehiculo) {
//         return res.status(400).json({ 
//             success: false,
//             error: 'Faltan datos obligatorios. Asegúrese de que ambas fotos se hayan subido correctamente.' 
//         });
//     }

//     const client = await pool.connect();

//     try {
//         await client.query('BEGIN');

//         // 2. Insertar o actualizar en la tabla 'repartidores'
//         // Ajustado a tus nombres reales: is_active y is_available
//         const driverQuery = `
//             INSERT INTO repartidores (
//                 usuario_id, 
//                 documento_identidad, 
//                 tipo_documento, 
//                 tipo_vehiculo_id, 
//                 foto, 
//                 foto_vehiculo, 
//                 is_active, 
//                 is_available
//             ) 
//             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
//             ON CONFLICT (usuario_id) 
//             DO UPDATE SET 
//                 documento_identidad = EXCLUDED.documento_identidad,
//                 tipo_documento = EXCLUDED.tipo_documento,
//                 tipo_vehiculo_id = EXCLUDED.tipo_vehiculo_id,
//                 foto = EXCLUDED.foto,
//                 foto_vehiculo = EXCLUDED.foto_vehiculo,
//                 is_active = 'activo'
//             RETURNING *;
//         `;

//         const driverValues = [
//             usuario_id, 
//             documento_identidad, 
//             tipo_documento, 
//             tipo_vehiculo_id, 
//             foto, 
//             foto_vehiculo,
//             'activo', 
//             false // Se registra pero inicia como NO disponible (is_available)
//         ];

//         const driverResult = await client.query(driverQuery, driverValues);

//         // 3. Actualizar el rol del usuario en la tabla general de usuarios
//         await client.query(
//             'UPDATE usuarios SET tipo = $1 WHERE id = $2',
//             ['repartidor', usuario_id]
//         );

//         await client.query('COMMIT');

//         res.status(201).json({
//             success: true,
//             message: 'Conductor registrado y activado con éxito',
//             data: driverResult.rows[0]
//         });

//     } catch (error) {
//         await client.query('ROLLBACK');
//         console.error('Error en registerDriverInterview:', error);
//         res.status(500).json({ 
//             success: false, 
//             error: 'Error interno al procesar el registro del conductor.' 
//         });
//     } finally {
//         client.release();
//     }
// };


