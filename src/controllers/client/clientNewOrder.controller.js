
import { pool } from "../../db.js";

const getOrCreateAddressId = async (address, municipality, client, clienteId) => {
  const checkQuery = `
        SELECT id FROM direcciones 
        WHERE usuario_id = $1 AND calle ILIKE $2 AND municipio ILIKE $3;
    `;
  const checkResult = await client.query(checkQuery, [clienteId, address, municipality]);

  if (checkResult.rows.length > 0) return checkResult.rows[0].id;

  const insertQuery = `
        INSERT INTO direcciones (usuario_id, calle, municipio, ciudad) 
        VALUES ($1, $2, $3, $4) 
        RETURNING id;
    `;
  const insertResult = await client.query(insertQuery, [clienteId, address, municipality, municipality]);

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
    return res.status(400).json({ error: "Faltan datos de pago o referencia bancaria." });
  }

  const client = await pool.connect();

  try {
    const bankVerification = true; 
    await client.query("BEGIN");

    const direccionRecogidaId = await getOrCreateAddressId(pickup, pickupMunicipality, client, clienteId);
    const direccionEntregaId = await getOrCreateAddressId(delivery, deliveryMunicipality, client, clienteId);

    if (bankVerification !== true) {
      // ... (Lógica de pago fallido)
      await client.query("COMMIT");
      return res.status(402).json({ error: "Pago no verificado." });
    }

    // --- PASO 4: CREAR PEDIDO ---
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

    // --- PASO 5: ASIGNACIÓN FIFO INMEDIATA ---
    const findDriverQuery = `
      SELECT usuario_id FROM repartidores 
      WHERE is_active = 'activo' AND is_available = true 
      ORDER BY available_since ASC 
      LIMIT 1 FOR UPDATE SKIP LOCKED; 
    `;
    const driverResult = await client.query(findDriverQuery);

    let driverId = null;
    if (driverResult.rowCount > 0) {
      driverId = driverResult.rows[0].usuario_id;

      // ✅ Mantenemos tu lógica pero agregamos tiene_pedido = true
      await client.query(
        "UPDATE repartidores SET is_available = false, tiene_pedido = true WHERE usuario_id = $1",
        [driverId]
      );

      await client.query(
        "UPDATE pedidos SET estado = 'asignado', repartidor_id = $1 WHERE id = $2",
        [driverId, newOrderId]
      );

      await client.query(
        "INSERT INTO repartidores_pedidos (repartidor_id, pedido_id) VALUES ($1, $2)",
        [driverId, newOrderId]
      );
    }

    await client.query("COMMIT");

    // --- PASO 6: NOTIFICACIÓN SOCKET (VERSION QUE TE FUNCIONA) ---
    if (driverId) {
      const io = req.app.get("socketio");
      const userQuery = await pool.query("SELECT nombre FROM usuarios WHERE id = $1", [clienteId]);
      const clienteNombre = userQuery.rows[0]?.nombre || "Cliente Nuevo";

      // 🚨 Sala original que usabas
      const targetRoom = `driver_${driverId}`;

      io.to(targetRoom).emit("NUEVO_PEDIDO", {
        pedido_id: newOrderId,
        monto: price_usd,
        cliente_nombre: clienteNombre,
        recogida: pickup,
        entrega: delivery,
        estado: 'asignado'
      });

      console.log(`✅ Socket enviado a sala: ${targetRoom}`);
    }

    res.status(201).json({
      message: "Pedido procesado y asignado.",
      orderId: newOrderId,
      repartidorAsignado: !!driverId
    });

  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("❌ Error en createOrder:", error.message);
    res.status(500).json({ error: "Error interno al crear el pedido." });
  } finally {
    client.release();
  }
};

// import { pool } from "../../db.js";
// // import { verifyMercantilPayment } from "../../services/payment.service.js"; // Asegúrate de que esté disponible

// /**
//  * Función auxiliar para buscar una dirección existente o crear una nueva.
//  */
// const getOrCreateAddressId = async (address, municipality, client, clienteId) => {
//   const checkQuery = `
//         SELECT id FROM direcciones 
//         WHERE usuario_id = $1 AND calle ILIKE $2 AND municipio ILIKE $3;
//     `;
//   const checkResult = await client.query(checkQuery, [clienteId, address, municipality]);

//   if (checkResult.rows.length > 0) {
//     return checkResult.rows[0].id;
//   }

//   const insertQuery = `
//         INSERT INTO direcciones (usuario_id, calle, municipio, ciudad) 
//         VALUES ($1, $2, $3, $4) 
//         RETURNING id;
//     `;
//   const insertResult = await client.query(insertQuery, [clienteId, address, municipality, municipality]);

//   return insertResult.rows[0].id;
// };

// export const createOrder = async (req, res) => {
//   const clienteId = req.userId;
//   const {
//     pickup,
//     pickupMunicipality,
//     delivery,
//     deliveryMunicipality,
//     price,
//     price_usd,
//     typevehicle,
//     typeservice,
//     receptpay,
//     payerPhone,
//     exchangeRate,
//   } = req.body;

//   if (!clienteId || !receptpay || !payerPhone || !price || !exchangeRate) {
//     return res.status(400).json({ error: "Faltan datos de pago o referencia bancaria." });
//   }

//   const client = await pool.connect();

//   try {
//     // --- PASO 1: CONSULTAR AL BANCO ---
//     const bankVerification = true; // Simulación de verificación exitosa

//     // --- PASO 2: INICIAR DB TRANSACCIÓN ---
//     await client.query("BEGIN");

//     const direccionRecogidaId = await getOrCreateAddressId(pickup, pickupMunicipality, client, clienteId);
//     const direccionEntregaId = await getOrCreateAddressId(delivery, deliveryMunicipality, client, clienteId);

//     // --- PASO 3: SI EL PAGO FALLÓ ---
//     if (bankVerification !== true) {
//       const failedPaymentQuery = `
//                 INSERT INTO payments (
//                     cliente_id, referencia_bancaria, 
//                     telefono_pagador, monto_ves, tasa_aplicada, 
//                     estado_pago, mensaje_respuesta_banco
//                 ) 
//                 VALUES ($1, $2, $3, $4, $5, 'fallido', $6);
//             `;
//       await client.query(failedPaymentQuery, [
//         clienteId,
//         receptpay,
//         payerPhone,
//         price,
//         exchangeRate,
//         "El banco no confirmó la transacción.",
//       ]);

//       await client.query("COMMIT");
//       return res.status(402).json({ error: "Pago no verificado." });
//     }

//     // --- PASO 4: SI EL PAGO FUE EXITOSO - CREAR PEDIDO ---
//     const orderQuery = `
//       INSERT INTO pedidos (
//           cliente_id, direccion_origen_id, direccion_destino_id, 
//           municipio_origen, municipio_destino, total, total_dolar, 
//           tipo_vehiculo_id, tipo_servicio_id, nro_recibo, 
//           fecha_pedido, estado, pago_confirmado
//       ) 
//       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pendiente', TRUE) 
//       RETURNING id, fecha_pedido;
//     `;

//     const orderResult = await client.query(orderQuery, [
//       clienteId,
//       direccionRecogidaId,
//       direccionEntregaId,
//       pickupMunicipality,
//       deliveryMunicipality,
//       price,
//       price_usd,
//       typevehicle,
//       typeservice,
//       receptpay,
//       new Date(),
//     ]);

//     const newOrderId = orderResult.rows[0].id;

//     // --- PASO 5: ASIGNACIÓN FIFO INMEDIATA ---
//     const findDriverQuery = `
//       SELECT usuario_id FROM repartidores 
//       WHERE is_active = 'activo' AND is_available = true 
//       ORDER BY available_since ASC 
//       LIMIT 1 FOR UPDATE SKIP LOCKED; 
//     `;
//     const driverResult = await client.query(findDriverQuery);

//     let driverId = null;
//     if (driverResult.rowCount > 0) {
//       driverId = driverResult.rows[0].usuario_id;

//       // Actualizar repartidor (no disponible)
//       await client.query(
//         "UPDATE repartidores SET is_available = false WHERE usuario_id = $1",
//         [driverId]
//       );

//       // Vincular pedido al repartidor (repartidor_id es el id de usuario)
//       await client.query(
//         "UPDATE pedidos SET estado = 'asignado', repartidor_id = $1 WHERE id = $2",
//         [driverId, newOrderId]
//       );

//       // Insertar en historial
//       await client.query(
//         "INSERT INTO repartidores_pedidos (repartidor_id, pedido_id) VALUES ($1, $2)",
//         [driverId, newOrderId]
//       );
//     }

//     await client.query("COMMIT");

//     // --- PASO 6: NOTIFICACIÓN EN TIEMPO REAL CORREGIDA ---
//     if (driverId) {
//       const io = req.app.get("socketio");
      
//       const userQuery = await pool.query("SELECT nombre FROM usuarios WHERE id = $1", [clienteId]);
//       const clienteNombre = userQuery.rows[0]?.nombre || "Cliente Nuevo";

//       // 🚨 IMPORTANTE: Sala 'driver_' para que el Dashboard lo reciba
//       const targetRoom = `driver_${driverId}`;

//       io.to(targetRoom).emit("NUEVO_PEDIDO", {
//         pedido_id: newOrderId,
//         monto: price_usd,
//         cliente_nombre: clienteNombre,
//         recogida: pickup,
//         entrega: delivery,
//         estado: 'asignado'
//       });

//       console.log(`✅ Socket enviado a sala: ${targetRoom} para pedido #${newOrderId}`);
//     }

//     res.status(201).json({
//       message: "Pedido procesado y asignado.",
//       orderId: newOrderId,
//       repartidorAsignado: !!driverId
//     });

//   } catch (error) {
//     if (client) await client.query("ROLLBACK");
//     console.error("❌ Error en createOrder:", error.message);
//     res.status(500).json({ error: "Error interno al crear el pedido." });
//   } finally {
//     client.release();
//   }
// };

