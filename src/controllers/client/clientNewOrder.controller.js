

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
// --- PASO 6: NOTIFICACIÓN SOCKET (CON DATOS DE TU BD) ---
if (driverId) {
  const io = req.app.get("socketio");

  try {
    // Consultamos los nombres usando exactamente tus tablas: 'usuarios' y 'tipos_servicios'
    const infoQuery = await client.query(`
      SELECT 
        (SELECT nombre FROM usuarios WHERE id = $1) as cliente_nombre,
        (SELECT descript FROM tipos_servicios WHERE id = $2) as servicio_nombre
    `, [clienteId, typeservice]);

    const info = infoQuery.rows[0];
    const targetRoom = `driver_${driverId}`;

    // Construimos el objeto para el Frontend
    const payload = {
      pedido_id: newOrderId,
      monto_usd: price_usd,                     
      monto_bs: price,                         
      cliente_nombre: info?.cliente_nombre || "Cliente Nuevo",
      cliente_telefono: payerPhone,            
      tipo_servicio: info?.servicio_nombre || "SERVICIO", 
      recogida: pickup,
      entrega: delivery,
      estado: 'asignado'
    };

    io.to(targetRoom).emit("NUEVO_PEDIDO", payload);

    console.log(`✅ Socket enviado a sala: ${targetRoom} | Pedido: #${newOrderId} | Servicio: ${info?.servicio_nombre}`);

  } catch (socketError) {
    console.error("⚠️ Error al obtener nombres para el socket:", socketError.message);
    
    // Fallback: Si la consulta falla, enviamos el socket con datos básicos para no bloquear al driver
    req.app.get("socketio").to(`driver_${driverId}`).emit("NUEVO_PEDIDO", {
      pedido_id: newOrderId,
      monto_usd: price_usd,
      monto_bs: price,
      cliente_nombre: "Nuevo Pedido",
      cliente_telefono: payerPhone,
      tipo_servicio: "DELIVERY",
      recogida: pickup,
      entrega: delivery,
      estado: 'asignado'
    });
  }
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

// const getOrCreateAddressId = async (address, municipality, client, clienteId) => {
//   const checkQuery = `
//         SELECT id FROM direcciones 
//         WHERE usuario_id = $1 AND calle ILIKE $2 AND municipio ILIKE $3;
//     `;
//   const checkResult = await client.query(checkQuery, [clienteId, address, municipality]);

//   if (checkResult.rows.length > 0) return checkResult.rows[0].id;

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
//     const bankVerification = true; 
//     await client.query("BEGIN");

//     const direccionRecogidaId = await getOrCreateAddressId(pickup, pickupMunicipality, client, clienteId);
//     const direccionEntregaId = await getOrCreateAddressId(delivery, deliveryMunicipality, client, clienteId);

//     if (bankVerification !== true) {
//       // ... (Lógica de pago fallido)
//       await client.query("COMMIT");
//       return res.status(402).json({ error: "Pago no verificado." });
//     }

//     // --- PASO 4: CREAR PEDIDO ---
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

//       // ✅ Mantenemos tu lógica pero agregamos tiene_pedido = true
//       await client.query(
//         "UPDATE repartidores SET is_available = false, tiene_pedido = true WHERE usuario_id = $1",
//         [driverId]
//       );

//       await client.query(
//         "UPDATE pedidos SET estado = 'asignado', repartidor_id = $1 WHERE id = $2",
//         [driverId, newOrderId]
//       );

//       await client.query(
//         "INSERT INTO repartidores_pedidos (repartidor_id, pedido_id) VALUES ($1, $2)",
//         [driverId, newOrderId]
//       );
//     }

//     await client.query("COMMIT");

//     // --- PASO 6: NOTIFICACIÓN SOCKET (VERSION QUE TE FUNCIONA) ---
//     if (driverId) {
//       const io = req.app.get("socketio");
//       const userQuery = await pool.query("SELECT nombre FROM usuarios WHERE id = $1", [clienteId]);
//       const clienteNombre = userQuery.rows[0]?.nombre || "Cliente Nuevo";

//       // 🚨 Sala original que usabas
//       const targetRoom = `driver_${driverId}`;

//       io.to(targetRoom).emit("NUEVO_PEDIDO", {
//         pedido_id: newOrderId,
//         monto: price_usd,
//         cliente_nombre: clienteNombre,
//         recogida: pickup,
//         entrega: delivery,
//         estado: 'asignado'
//       });

//       console.log(`✅ Socket enviado a sala: ${targetRoom}`);
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

