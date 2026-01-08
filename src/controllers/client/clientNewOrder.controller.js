
import { pool } from '../../db.js';

/**
 * Función auxiliar para buscar una dirección existente o crear una nueva.
 * @param {string} address La calle a buscar/insertar.
 * @param {object} client La instancia del cliente de la pool de PG (dentro de la transacción).
 * @param {number} clienteId El ID del usuario asociado a la dirección.
 * @returns {number} El ID de la dirección (existente o nueva).
 */
const getOrCreateAddressId = async (address, client, clienteId) => {
    // 1. Intentar encontrar la dirección existente (por calle y usuario)
    const checkQuery = `
        SELECT id FROM direcciones 
        WHERE usuario_id = $1 AND calle ILIKE $2; -- ILIKE para búsqueda insensible a mayúsculas/minúsculas
    `;
    const checkResult = await client.query(checkQuery, [clienteId, address]);

    if (checkResult.rows.length > 0) {
        // La dirección ya existe, devolver su ID
        return checkResult.rows[0].id;
    }

    // 2. La dirección NO existe, insertarla
    const insertQuery = `
        INSERT INTO direcciones (usuario_id, calle, ciudad) 
        VALUES ($1, $2, $3) 
        RETURNING id;
    `;
    // Usamos 'Desconocida' como valor por defecto para 'ciudad'
    const insertResult = await client.query(insertQuery, [clienteId, address, 'Desconocida']); 
    
    return insertResult.rows[0].id;
};


//  Controlador para crear un nuevo pedido (Order).
 
export const createOrder = async (req, res) => {
    const clienteId = req.userId; 
    const { pickup, delivery, price, price_usd, typevehicle, typeservice, receptpay } = req.body;

    if (!clienteId || !pickup || !delivery || !typevehicle || !typeservice || !receptpay || price === undefined) {
        return res.status(400).json({ error: 'Faltan campos obligatorios para crear el pedido.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Procesar direcciones
        const direccionRecogidaId = await getOrCreateAddressId(pickup, client, clienteId);
        const direccionEntregaId = await getOrCreateAddressId(delivery, client, clienteId);

        // INSERT corregido con los nombres de tu tabla
        const orderQuery = `
            INSERT INTO pedidos (
                cliente_id,             -- $1
                direccion_destino_id,   -- $2 (Corregido: era direccion_entrega_id)
                total,                  -- $3
                estado,                 
                fecha_pedido,           
                total_dolar,            -- $4
                direccion_origen_id,    -- $5
                tipo_servicio_id,       -- $6
                tipo_vehiculo_id,       -- $7
                nro_recibo              -- $8
            ) 
            VALUES ($1, $2, $3, 'pendiente', NOW(), $4, $5, $6, $7, $8)
            RETURNING id;
        `;

        const orderResult = await client.query(orderQuery, [
            clienteId,           // $1
            direccionEntregaId,  // $2
            price,               // $3
            price_usd,           // $4
            direccionRecogidaId, // $5
            typeservice,         // $6
            typevehicle,         // $7
            receptpay            // $8
        ]);

        await client.query('COMMIT');

        res.status(201).json({ 
            message: 'Pedido creado exitosamente.',
            orderId: orderResult.rows[0].id 
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error REAL en la base de datos:", error.message); // Mira esto en tu terminal
        res.status(500).json({ error: 'Error interno del servidor.', detalle: error.message });
    } finally {
        client.release();
    }
};



// export const createOrder = async (req, res) => {
//     // 1. Extraer ID del cliente del token y datos del body
    
//     const clienteId = req.userId; 
//     const { pickup, delivery, price, price_usd, typevehicle, typeservice, receptpay } = req.body;

//     if (!clienteId || !pickup || !delivery || !typevehicle || !typeservice || !receptpay || price === undefined) {
//         return res.status(400).json({ error: 'Faltan campos obligatorios para crear el pedido.' });
//     }

//     const client = await pool.connect();

//     try {
//         await client.query('BEGIN'); // Iniciar la transacción

//         // 2. PROCESAR Dirección de Recogida (Origen)
//         // Reutiliza la dirección si ya existe, sino, la crea.
//         const direccionRecogidaId = await getOrCreateAddressId(pickup, client, clienteId);
        
//         // 3. PROCESAR Dirección de Entrega (Destino)
//         // Reutiliza la dirección si ya existe, sino, la crea.
//         const direccionEntregaId = await getOrCreateAddressId(delivery, client, clienteId);

//         // 4. Insertar el Nuevo Pedido en la tabla 'pedidos'
//         // NOTA: Usé 'total_dolar' y corregí la sintaxis del INSERT
//         const orderQuery = `
//             INSERT INTO pedidos (
//                 cliente_id, 
//                 direccion_destino_id,       -- ID de la dirección de entrega (Destino)
//                 total, 
//                 estado, 
//                 fecha_pedido,
//                 total_dolar,                -- Usando el nombre correcto
//                 direccion_origen_id,         -- Asumiendo que esta es la ID de Recogida (Origen)
//                 tipo_servicio_id,
//                 tipo_vehiculo_id,
//                 nro_recibo
//             ) 
//             VALUES ($1, $2, $3, 'pendiente', NOW(), $4, $5, $6, $7, $8)
//             RETURNING id;
//         `;
//         const orderResult = await client.query(orderQuery, [
//             clienteId, 
//             direccionEntregaId,     // $2: ID de Destino (Delivery)
//             price,                  // $3: Total en moneda local
//             price_usd,              // $4: Total en Dólar (total_dolar)
//             direccionRecogidaId,    // $5: ID de Origen (Pickup)
//             typeservice,
//             typevehicle,
//             receptpay
//         ]);

//         await client.query('COMMIT'); // Confirmar la transacción

//         res.status(201).json({ 
//             message: 'Pedido creado exitosamente y en espera de Conductor.',
//             orderId: orderResult.rows[0].id 
//         });

//     } catch (error) {
//         await client.query('ROLLBACK'); // Revertir si algo falla
//         console.error("Error en la transacción al crear el pedido:", error);
//         res.status(500).json({ error: 'Error interno del servidor al procesar el pedido.' });
//     } finally {
//         client.release();
//     }
// };

// import { pool } from '../../db.js';
// /**
//  * Controlador para crear un nuevo pedido (Order).
//  * Este proceso es transaccional: debe insertar dos direcciones y el pedido.
//  * Requiere: req.userId (del token), y body: { pickup, delivery, details, price }.
//  */
// export const createOrder = async (req, res) => {
//     // 1. Extraer ID del cliente del token (inyectado por verifyToken)
//     const clienteId = req.userId; 
//     const { pickup, delivery, details, price, price_usd } = req.body;

//     if (!clienteId || !pickup || !delivery || !details || price === undefined) {
//         return res.status(400).json({ error: 'Faltan campos obligatorios para crear el pedido.' });
//     }

//     // Usamos una transacción para garantizar la integridad de los datos
//     const client = await pool.connect();

//     try {
//         await client.query('BEGIN'); // Iniciar la transacción

//         // 2. Insertar Dirección de Recogida (Origen) en la tabla 'direcciones'
//         const pickupQuery = `
//             INSERT INTO direcciones (usuario_id,calle, ciudad) 
//             VALUES ($1, $2, $3) 
//             RETURNING id;
//         `;
//         // Usamos valores por defecto para ciudad/país
//         const pickupResult = await client.query(pickupQuery, [clienteId,pickup, 'Desconocida']); 
//         const direccionRecogidaId = pickupResult.rows[0].id;

//         // 3. Insertar Dirección de Entrega (Destino) en la tabla 'direcciones'
//                     // INSERT INTO direcciones (calle, ciudad, pais) 
//         const deliveryQuery = `

//             INSERT INTO direcciones (usuario_id,calle, ciudad) 
//             VALUES ($1, $2, $3) 
//             RETURNING id;
//         `;
//         const deliveryResult = await client.query(deliveryQuery, [clienteId,delivery, 'Desconocida']); 
//         const direccionEntregaId = deliveryResult.rows[0].id;

//         // 4. Insertar el Nuevo Pedido en la tabla 'pedidos'
//         // direccion_recogida_id, 
//         // detalles, 
//         const orderQuery = `
//             INSERT INTO pedidos (
//                 cliente_id, 
//                 direccion_entrega_id, 
//                 total, 
//                 estado, 
//                 fecha_pedido,
//                 total_dolar,
//                 direccion_origen_id
//             ) 
//              VALUES ($1, $2, $3, 'pendiente', NOW(),$4,$5)
//             RETURNING id;
//         `;
//         const orderResult = await client.query(orderQuery, [
//             clienteId, 
//             direccionEntregaId, 
//             price,
//             price_usd, 
//             direccionRecogidaId
//         ]);

//         await client.query('COMMIT'); // Confirmar la transacción

//         res.status(201).json({ 
//             message: 'Pedido creado exitosamente y en espera de repartidor.',
//             orderId: orderResult.rows[0].id 
//         });

//     } catch (error) {
//         await client.query('ROLLBACK'); // Revertir si algo falla
//         console.error("Error en la transacción al crear el pedido:", error);
//         res.status(500).json({ error: 'Error interno del servidor al procesar el pedido.' });
//     } finally {
//         client.release();
//     }
// };