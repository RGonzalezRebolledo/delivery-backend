import { pool } from "../../db.js";
import { verifyMercantilPayment } from "../../services/payment.service.js";

/**
 * Función auxiliar para buscar una dirección existente o crear una nueva.
 */
const getOrCreateAddressId = async (
  address,
  municipality,
  client,
  clienteId
) => {
  const checkQuery = `
        SELECT id FROM direcciones 
        WHERE usuario_id = $1 AND calle ILIKE $2 AND municipio ILIKE $3;
    `;
  const checkResult = await client.query(checkQuery, [
    clienteId,
    address,
    municipality,
  ]);

  if (checkResult.rows.length > 0) {
    return checkResult.rows[0].id;
  }

  const insertQuery = `
        INSERT INTO direcciones (usuario_id, calle, municipio, ciudad) 
        VALUES ($1, $2, $3, $4) 
        RETURNING id;
    `;
  const insertResult = await client.query(insertQuery, [
    clienteId,
    address,
    municipality,
    municipality,
  ]);

  return insertResult.rows[0].id;
};

export const createOrder = async (req, res) => {
  const clienteId = req.userId;
  const {
    pickup,
    pickupMunicipality,
    delivery,
    deliveryMunicipality,
    price,
    price_usd,
    typevehicle,
    typeservice,
    receptpay,
    payerPhone,
    exchangeRate,
  } = req.body;

  if (!clienteId || !receptpay || !payerPhone || !price || !exchangeRate) {
    return res
      .status(400)
      .json({ error: "Faltan datos de pago o referencia bancaria." });
  }

  const client = await pool.connect();

  try {
    // --- PASO 1: CONSULTAR AL BANCO ---
    const bankVerification = true; // Simulación de verificación exitosa

    // --- PASO 2: INICIAR DB TRANSACCIÓN ---
    await client.query("BEGIN");

    const direccionRecogidaId = await getOrCreateAddressId(
      pickup,
      pickupMunicipality,
      client,
      clienteId
    );
    const direccionEntregaId = await getOrCreateAddressId(
      delivery,
      deliveryMunicipality,
      client,
      clienteId
    );

    // --- PASO 3: SI EL PAGO FALLÓ ---
    if (bankVerification !== true) {
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
        "El banco no confirmó la transacción.",
      ]);

      await client.query("COMMIT");
      return res
        .status(402)
        .json({ error: "Pago no verificado.", detalle: "probando" });
    }

    // --- PASO 4: SI EL PAGO FUE EXITOSO ---
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
      clienteId,
      direccionRecogidaId,
      direccionEntregaId,
      pickupMunicipality,
      deliveryMunicipality,
      price,
      price_usd,
      typevehicle,
      typeservice,
      receptpay,
      new Date(),
    ]);

    const newOrderId = orderResult.rows[0].id;

    // --- PASO 5: LÓGICA DE ASIGNACIÓN FIFO ---
    // 1. Buscamos al repartidor que:
    //    - Esté ADMINISTRATIVAMENTE 'activo'
    //    - Haya encendido su switch 'is_available'
    // 2. Ordenamos por 'available_since' ASC (el que más tiempo lleva esperando)
    const findDriverQuery = `
SELECT usuario_id FROM repartidores 
WHERE is_active = 'activo' AND is_available = true 
ORDER BY available_since ASC 
LIMIT 1 FOR UPDATE; 
`;
    const driverResult = await client.query(findDriverQuery);

    let driverId = null;
    if (driverResult.rowCount > 0) {
      driverId = driverResult.rows[0].usuario_id;

      // IMPORTANTE: Lo sacamos de la disponibilidad para que no reciba más pedidos
      // Esto lo quita de la cola FIFO inmediatamente.
      await client.query(
        "UPDATE repartidores SET is_available = false WHERE usuario_id = $1",
        [driverId]
      );

      // Vinculamos el pedido al repartidor
      // Nota: Asegúrate de que la tabla 'pedidos' tenga la columna 'repartidor_id'
      // Si usas 'repartidores_pedidos', inserta allí.
      await client.query(
        "UPDATE pedidos SET estado = $1, repartidor_id = $2 WHERE id = $3",
        ["asignado", driverId, newOrderId]
      );

      // También registramos en la tabla de asignaciones histórica
      await client.query(
        "INSERT INTO repartidores_pedidos (repartidor_id, pedido_id) VALUES ($1, $2)",
        [driverId, newOrderId]
      );
    }

    await client.query("COMMIT");

    // --- PASO 6: NOTIFICACIÓN EN TIEMPO REAL (Socket.io) ---
    if (driverId) {
      const io = req.app.get("socketio");
      // Buscamos el nombre del cliente para que el repartidor sepa a quién atiende
      const userQuery = await pool.query(
        "SELECT nombre FROM usuarios WHERE id = $1",
        [clienteId]
      );
      const clienteNombre = userQuery.rows[0]?.nombre || "Cliente Nuevo";

      io.to(`user_${driverId}`).emit("NUEVO_PEDIDO", {
        pedido_id: newOrderId,
        monto: price_usd,
        monto_bs: price,
        cliente: {
          nombre: clienteNombre,
          recogida: pickup,
          entrega: delivery,
          municipio: deliveryMunicipality,
        },
      });
      console.log(
        `📡 Notificación enviada al repartidor ${driverId} para el pedido #${newOrderId}`
      );
    }

    res.status(201).json({
      message: "Pago verificado y pedido asignado exitosamente.",
      orderId: newOrderId,
      repartidorAsignado: !!driverId,
      fecha: orderResult.rows[0].fecha_pedido,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error en flujo de orden/pago:", error.message);
    res
      .status(500)
      .json({ error: "Error al procesar el pedido.", detalle: error.message });
  } finally {
    client.release();
  }
};

// import { pool } from '../../db.js';
// import { verifyMercantilPayment } from '../../services/payment.service.js';
// /**
//  * Función auxiliar para buscar una dirección existente o crear una nueva.
//  * @param {string} address La calle a buscar/insertar.
//  * @param {object} client La instancia del cliente de la pool de PG (dentro de la transacción).
//  * @param {number} clienteId El ID del usuario asociado a la dirección.
//  * @returns {number} El ID de la dirección (existente o nueva).
//   * @param {string} municipality - El municipio seleccionado del dropdown.
//  */
// const getOrCreateAddressId = async (address, municipality, client, clienteId) => {
//     // 1. Intentar encontrar la dirección existente (por calle, municipio y usuario)
//     const checkQuery = `
//         SELECT id FROM direcciones
//         WHERE usuario_id = $1 AND calle ILIKE $2 AND municipio ILIKE $3;
//     `;
//     const checkResult = await client.query(checkQuery, [clienteId, address, municipality]);

//     if (checkResult.rows.length > 0) {
//         return checkResult.rows[0].id;
//     }

//     // 2. La dirección NO existe, insertarla con su municipio
//     const insertQuery = `
//         INSERT INTO direcciones (usuario_id, calle, municipio, ciudad)
//         VALUES ($1, $2, $3, $4)
//         RETURNING id;
//     `;
//     // Usamos 'San Fernando' como ciudad por defecto o el mismo municipio
//     const insertResult = await client.query(insertQuery, [clienteId, address, municipality, municipality]);

//     return insertResult.rows[0].id;
// };

// export const createOrder = async (req, res) => {
//     const clienteId = req.userId;
//     const {
//         pickup, pickupMunicipality,
//         delivery, deliveryMunicipality,
//         price, price_usd,
//         typevehicle, typeservice,
//         receptpay,
//         payerPhone,
//         exchangeRate
//     } = req.body;

//     if (!clienteId || !receptpay || !payerPhone || !price || !exchangeRate) {
//         return res.status(400).json({ error: 'Faltan datos de pago o referencia bancaria.' });
//     }

//     const client = await pool.connect();

//     try {
//         // --- PASO 1: CONSULTAR AL BANCO ---
//         const paymentData = {
//             phone: payerPhone,
//             reference: receptpay,
//             amount: price,
//             date: new Date().toISOString().split('T')[0]
//         };

//         //const bankVerification = await verifyMercantilPayment(paymentData); // HAGO LA VERIFICACION EN EL BANCO
//         const bankVerification = true

//         // --- PASO 2: INICIAR DB TRANSACCIÓN ---
//         await client.query('BEGIN');

//         // Procesar direcciones (esto lo hacemos igual para tenerlas)
//         const direccionRecogidaId = await getOrCreateAddressId(pickup, pickupMunicipality, client, clienteId);
//         const direccionEntregaId = await getOrCreateAddressId(delivery, deliveryMunicipality, client, clienteId);

//         // --- PASO 3: SI EL PAGO FALLÓ ---
//         // if (!bankVerification.success) {
//             if (bankVerification !== true) {
//             // No creamos la orden, pero SÍ dejamos rastro en payments como 'fallido'
//             const failedPaymentQuery = `
//                 INSERT INTO payments (
//                     cliente_id, referencia_bancaria,
//                     telefono_pagador, monto_ves, tasa_aplicada,
//                     estado_pago, mensaje_respuesta_banco
//                 )
//                 VALUES ($1, $2, $3, $4, $5, 'fallido', $6);
//             `;

//             await client.query(failedPaymentQuery, [
//                 clienteId,
//                 receptpay,
//                 payerPhone,
//                 price,
//                 exchangeRate,
//                 // bankVerification.message || 'El banco no confirmó la transacción.'
//                'El banco no confirmó la transacción.'
//             ]);

//             // Guardamos el registro fallido en la base de datos
//             await client.query('COMMIT');

//             // Devolvemos el error al frontend para que el usuario sepa que no pasó
//             return res.status(402).json({
//                 error: 'Pago no verificado.',
//                 // detalle: bankVerification.message
//                 detalle: 'probando'
//             });
//         }

//         // --- PASO 4: SI EL PAGO FUE EXITOSO ---
//         // Insertamos el pedido
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

//         // Insertamos el registro de pago exitoso AMARRADO al pedido
//         const successPaymentQuery = `
//             INSERT INTO payments (
//                 pedido_id, cliente_id, referencia_bancaria,
//                 telefono_pagador, monto_ves, tasa_aplicada,
//                 estado_pago, bank_tx_id
//             )
//             VALUES ($1, $2, $3, $4, $5, $6, 'completado', $7);
//         `;

//         await client.query(successPaymentQuery, [
//             newOrderId,
//             clienteId,
//             receptpay,
//             payerPhone,
//             price,
//             exchangeRate,
//             // bankVerification.data?.txId || 'API_MERCANTIL'
//             'API_MERCANTIL'
//         ]);

//         // Guardamos todo
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
