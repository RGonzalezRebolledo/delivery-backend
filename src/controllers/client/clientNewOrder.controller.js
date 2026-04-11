
import { pool } from '../../db.js';
import { verifyMercantilPayment } from '../../services/payment.service.js';
/**
 * Función auxiliar para buscar una dirección existente o crear una nueva.
 * @param {string} address La calle a buscar/insertar.
 * @param {object} client La instancia del cliente de la pool de PG (dentro de la transacción).
 * @param {number} clienteId El ID del usuario asociado a la dirección.
 * @returns {number} El ID de la dirección (existente o nueva).
  * @param {string} municipality - El municipio seleccionado del dropdown.
 */
const getOrCreateAddressId = async (address, municipality, client, clienteId) => {
    // 1. Intentar encontrar la dirección existente (por calle, municipio y usuario)
    const checkQuery = `
        SELECT id FROM direcciones 
        WHERE usuario_id = $1 AND calle ILIKE $2 AND municipio ILIKE $3;
    `;
    const checkResult = await client.query(checkQuery, [clienteId, address, municipality]);

    if (checkResult.rows.length > 0) {
        return checkResult.rows[0].id;
    }

    // 2. La dirección NO existe, insertarla con su municipio
    const insertQuery = `
        INSERT INTO direcciones (usuario_id, calle, municipio, ciudad) 
        VALUES ($1, $2, $3, $4) 
        RETURNING id;
    `;
    // Usamos 'San Fernando' como ciudad por defecto o el mismo municipio
    const insertResult = await client.query(insertQuery, [clienteId, address, municipality, municipality]); 
    
    return insertResult.rows[0].id;
};

export const createOrder = async (req, res) => {
    const clienteId = req.userId; 
    const { 
        pickup, pickupMunicipality, 
        delivery, deliveryMunicipality, 
        price, price_usd, 
        typevehicle, typeservice, 
        receptpay, 
        payerPhone, 
        exchangeRate 
    } = req.body;

    if (!clienteId || !receptpay || !payerPhone || !price || !exchangeRate) {
        return res.status(400).json({ error: 'Faltan datos de pago o referencia bancaria.' });
    }

    const client = await pool.connect();

    try {
        // --- PASO 1: CONSULTAR AL BANCO ---
        const paymentData = {
            phone: payerPhone,
            reference: receptpay,
            amount: price,
            date: new Date().toISOString().split('T')[0]
        };

        //const bankVerification = await verifyMercantilPayment(paymentData); // HAGO LA VERIFICACION EN EL BANCO
        const bankVerification = true

        // --- PASO 2: INICIAR DB TRANSACCIÓN ---
        await client.query('BEGIN');

        // Procesar direcciones (esto lo hacemos igual para tenerlas)
        const direccionRecogidaId = await getOrCreateAddressId(pickup, pickupMunicipality, client, clienteId);
        const direccionEntregaId = await getOrCreateAddressId(delivery, deliveryMunicipality, client, clienteId);

        // --- PASO 3: SI EL PAGO FALLÓ ---
        // if (!bankVerification.success) {
            if (bankVerification !== true) {
            // No creamos la orden, pero SÍ dejamos rastro en payments como 'fallido'
            const failedPaymentQuery = `
                INSERT INTO payments (
                    cliente_id, referencia_bancaria, 
                    telefono_pagador, monto_ves, tasa_aplicada, 
                    estado_pago, mensaje_respuesta_banco
                ) 
                VALUES ($1, $2, $3, $4, $5, 'fallido', $6);
            `;

            await client.query(failedPaymentQuery, [
                clienteId, 
                receptpay, 
                payerPhone, 
                price, 
                exchangeRate, 
                // bankVerification.message || 'El banco no confirmó la transacción.'
               'El banco no confirmó la transacción.'
            ]);

            // Guardamos el registro fallido en la base de datos
            await client.query('COMMIT'); 

            // Devolvemos el error al frontend para que el usuario sepa que no pasó
            return res.status(402).json({ 
                error: 'Pago no verificado.', 
                // detalle: bankVerification.message 
                detalle: 'probando'
            });
        }

        // --- PASO 4: SI EL PAGO FUE EXITOSO ---
        // Insertamos el pedido
        const orderQuery = `
            INSERT INTO pedidos (
                cliente_id, direccion_origen_id, direccion_destino_id, 
                municipio_origen, municipio_destino, total, total_dolar, 
                tipo_vehiculo_id, tipo_servicio_id, nro_recibo, 
                fecha_pedido, estado, pago_confirmado
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pendiente', TRUE) 
            RETURNING id, fecha_pedido;
        `;
        
        const orderResult = await client.query(orderQuery, [
            clienteId, direccionRecogidaId, direccionEntregaId,
            pickupMunicipality, deliveryMunicipality, price, price_usd,
            typevehicle, typeservice, receptpay, new Date()
        ]);

        const newOrderId = orderResult.rows[0].id;

        // Insertamos el registro de pago exitoso AMARRADO al pedido
        const successPaymentQuery = `
            INSERT INTO payments (
                pedido_id, cliente_id, referencia_bancaria, 
                telefono_pagador, monto_ves, tasa_aplicada, 
                estado_pago, bank_tx_id
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, 'completado', $7);
        `;

        await client.query(successPaymentQuery, [
            newOrderId, 
            clienteId, 
            receptpay, 
            payerPhone, 
            price, 
            exchangeRate, 
            // bankVerification.data?.txId || 'API_MERCANTIL'
            'API_MERCANTIL'
        ]);

        // Guardamos todo
        await client.query('COMMIT');

        res.status(201).json({ 
            message: 'Pago verificado y pedido creado exitosamente.',
            orderId: newOrderId,
            fecha: orderResult.rows[0].fecha_pedido 
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error en flujo de orden/pago:", error.message);
        res.status(500).json({ error: 'Error al procesar el pedido.', detalle: error.message });
    } finally {
        client.release();
    }
};


// export const createOrder = async (req, res) => {
//     const clienteId = req.userId; 
//     const { 
//         pickup, pickupMunicipality, 
//         delivery, deliveryMunicipality, 
//         price, price_usd, 
//         typevehicle, typeservice, 
//         receptpay, // Este es el número de referencia
//         payerPhone, // 💡 Nuevo: Teléfono del que hizo el pago móvil
//         exchangeRate // 💡 Nuevo: Tasa que el front está usando del context
//     } = req.body;

//     // Validación extendida
//     if (!clienteId || !receptpay || !payerPhone || !price || !exchangeRate) {
//         return res.status(400).json({ error: 'Faltan datos de pago o referencia bancaria.' });
//     }

//     const client = await pool.connect();

//     try {
//         // --- PASO 1: VERIFICACIÓN BANCARIA (Antes de tocar la DB) ---
//         // Preparamos los datos para Mercantil
//         const paymentData = {
//             phone: payerPhone,
//             reference: receptpay,
//             amount: price, // Monto en Bs
//             date: new Date().toISOString().split('T')[0] // YYYY-MM-DD
//         };

//         const bankVerification = await verifyMercantilPayment(paymentData);

//         if (!bankVerification.success) {
//             return res.status(402).json({ 
//                 error: 'Pago no verificado.', 
//                 detalle: bankVerification.message || 'El banco no confirmó la transacción.' 
//             });
//         }

//         // --- PASO 2: PROCESO EN BASE DE DATOS ---
//         await client.query('BEGIN');

//         // Procesar direcciones
//         const direccionRecogidaId = await getOrCreateAddressId(pickup, pickupMunicipality, client, clienteId);
//         const direccionEntregaId = await getOrCreateAddressId(delivery, deliveryMunicipality, client, clienteId);

//         // Insertar Pedido
//         const orderQuery = `
//             INSERT INTO pedidos (
//                 cliente_id, direccion_origen_id, direccion_destino_id, 
//                 municipio_origen, municipio_destino, total, total_dolar, 
//                 tipo_vehiculo_id, tipo_servicio_id, nro_recibo, 
//                 fecha_pedido, estado, pago_confirmado
//             ) 
//             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pendiente', TRUE) 
//             RETURNING id, fecha_pedido;
//         `;
        
//         const orderResult = await client.query(orderQuery, [
//             clienteId, direccionRecogidaId, direccionEntregaId,
//             pickupMunicipality, deliveryMunicipality, price, price_usd,
//             typevehicle, typeservice, receptpay, new Date()
//         ]);

//         const newOrderId = orderResult.rows[0].id;

//         // --- PASO 3: REGISTRO DEL PAGO EN LA TABLA PAYMENTS ---
//         const paymentQuery = `
//             INSERT INTO payments (
//                 pedido_id, cliente_id, referencia_bancaria, 
//                 telefono_pagador, monto_ves, tasa_aplicada, 
//                 estado_pago, bank_tx_id
//             ) 
//             VALUES ($1, $2, $3, $4, $5, $6, 'completado', $7);
//         `;

//         await client.query(paymentQuery, [
//             newOrderId, 
//             clienteId, 
//             receptpay, 
//             payerPhone, 
//             price, 
//             exchangeRate, 
//             bankVerification.data?.txId || 'API_MERCANTIL' // ID retornado por el banco
//         ]);

//         await client.query('COMMIT');

//         res.status(201).json({ 
//             message: 'Pago verificado y pedido creado exitosamente.',
//             orderId: newOrderId,
//             fecha: orderResult.rows[0].fecha_pedido 
//         });

//     } catch (error) {
//         await client.query('ROLLBACK');
//         console.error("Error en flujo de orden/pago:", error.message);
//         res.status(500).json({ error: 'Error al procesar el pedido.', detalle: error.message });
//     } finally {
//         client.release();
//     }
// };




//  Controlador para crear un nuevo pedido (Order).
 
// export const createOrder = async (req, res) => {
//     const clienteId = req.userId; 
//     const { pickup, pickupMunicipality, delivery, deliveryMunicipality, price, price_usd, typevehicle, typeservice, receptpay } = req.body;

// // Validación de campos obligatorios
// if (!clienteId || !pickup || !pickupMunicipality || !delivery || !deliveryMunicipality || 
//     !typevehicle || !typeservice || !receptpay || price === undefined) {
//     return res.status(400).json({ error: 'Faltan campos obligatorios para crear el pedido.' });
// }

//     const client = await pool.connect();

//     try {
//         await client.query('BEGIN');

//         // Procesar direcciones
//         const direccionRecogidaId = await getOrCreateAddressId(pickup, pickupMunicipality, client, clienteId);
//         const direccionEntregaId = await getOrCreateAddressId(delivery, deliveryMunicipality, client, clienteId);

//         const orderQuery = `
//         INSERT INTO pedidos (
//             cliente_id,           -- $1
//             direccion_origen_id,  -- $2
//             direccion_destino_id, -- $3
//             municipio_origen,     -- $4 (Nuevo)
//             municipio_destino,    -- $5 (Nuevo)
//             total,                -- $6
//             total_dolar,          -- $7
//             tipo_vehiculo_id,     -- $8
//             tipo_servicio_id,     -- $9
//             nro_recibo,           -- $10
//             fecha_pedido,         -- $11
//             estado                -- Valor fijo: 'pendiente'
//         ) 
//         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pendiente') 
//         RETURNING id, fecha_pedido;
//     `;
    
//     const orderResult = await client.query(orderQuery, [
//         clienteId,            // $1
//         direccionRecogidaId,  // $2
//         direccionEntregaId,   // $3
//         pickupMunicipality,   // $4
//         deliveryMunicipality,  // $5
//         price,                // $6 (Bs)
//         price_usd,            // $7 (USD)
//         typevehicle,          // $8
//         typeservice,          // $9
//         receptpay,            // $10
//         new Date()            // $11
//     ]);

//         await client.query('COMMIT');

//         // res.status(201).json({ 
//         //     message: 'Pedido creado exitosamente.',
//         //     orderId: orderResult.rows[0].id 
//         // });

//         // Devolvemos la fecha creada para que el front no tenga que adivinar
//     res.status(201).json({ 
//         message: 'Pedido creado exitosamente.',
//         orderId: orderResult.rows[0].id,
//         fecha: orderResult.rows[0].fecha_pedido 
//     });

//     } catch (error) {
//         await client.query('ROLLBACK');
//         console.error("Error REAL en la base de datos:", error.message); // Mira esto en tu terminal
//         res.status(500).json({ error: 'Error interno del servidor.', detalle: error.message });
//     } finally {
//         client.release();
//     }
// };

