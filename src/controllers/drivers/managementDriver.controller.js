import { pool } from "../../db.js";
import { assignPendingOrders } from "../../services/assignmentServices.js";

// 1. Cambiar Disponibilidad (Switch Manual)
export const toggleAvailability = async (req, res) => {
  const { available } = req.body;
  const userId = req.userId;
  const io = req.app.get("socketio");

  try {
    const query = `
            UPDATE repartidores 
            SET is_available = $1, 
                available_since = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE usuario_id = $2
            RETURNING is_available;
        `;
    const result = await pool.query(query, [available, userId]);

    if (result.rows[0]?.is_available && io) {
      assignPendingOrders(io);
    }

    res.json({
      success: true,
      isAvailable: result.rows[0]?.is_available,
    });
  } catch (error) {
    console.error("❌ Error en toggleAvailability:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// 2. Obtener estado actual (Sincronización)
export const getCurrentOrder = async (req, res) => {
  const usuarioId = req.userId; 
  try {
    const driverQuery = await pool.query(
      "SELECT is_active, is_available FROM repartidores WHERE usuario_id = $1",
      [usuarioId]
    );

    if (driverQuery.rowCount === 0) {
      return res.status(200).json({ driverStatus: 'no_registrado', active: false });
    }

    const { is_active, is_available } = driverQuery.rows[0];

    if (is_active !== 'activo') {
      return res.status(200).json({ driverStatus: is_active, active: false });
    }

    const orderQuery = await pool.query(`
      SELECT 
        p.id as pedido_id, p.total as monto_bs, p.total_dolar as monto_usd, p.estado, 
        u.nombre as cliente_nombre, u.telefono as cliente_telefono,
        ts.descript as tipo_servicio, d_orig.calle as recogida, d_dest.calle as entrega
      FROM pedidos p
      JOIN usuarios u ON p.cliente_id = u.id
      JOIN tipos_servicios ts ON p.tipo_servicio_id = ts.id
      JOIN direcciones d_orig ON p.direccion_origen_id = d_orig.id
      JOIN direcciones d_dest ON p.direccion_destino_id = d_dest.id
      WHERE p.repartidor_id = $1 AND p.estado IN ('asignado', 'en_camino')
      LIMIT 1
    `, [usuarioId]);

    return res.status(200).json({
      driverStatus: 'activo',
      active: orderQuery.rowCount > 0,
      isAvailableInDB: is_available,
      order: orderQuery.rows[0] || null
    });
  } catch (error) {
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

// 3. Lógica centralizada de estados (CON SOCKET PARA CLIENTE)
export const updateOrderStatus = async (req, res) => {
  const { pedido_id, status } = req.body;
  const driverId = req.userId;
  const io = req.app.get('socketio');
  const client = await pool.connect();

  try {
      await client.query("BEGIN");
      
      const orderRes = await client.query(
          `UPDATE pedidos 
           SET estado = $1 
           WHERE id = $2 AND repartidor_id = $3 
           RETURNING id, cliente_id, total, total_dolar`,
          [status, pedido_id, driverId]
      );

      if (orderRes.rows.length === 0) throw new Error("Pedido no encontrado");
      
      const { cliente_id, total: montoBs, total_dolar: montoUsd } = orderRes.rows[0];

      if (status === 'entregado') {
          // 1. Obtener porcentaje de la App
          const configRes = await client.query(
              "SELECT valor FROM configuracion_app WHERE clave = 'porcentaje_comision_delivery' LIMIT 1"
          );
          const porcentaje = configRes.rows[0]?.valor || 0;

          // 2. Cálculo en Bolívares
          const comisionBs = (montoBs * (porcentaje / 100)).toFixed(2);
          const netoRepartidorBs = (montoBs - comisionBs).toFixed(2);

          // 3. Cálculo en Dólares (Basado en lo que pagó el cliente)
          const comisionUsd = (montoUsd * (porcentaje / 100)).toFixed(2);
          const netoRepartidorUsd = (montoUsd - comisionUsd).toFixed(2);
          
          // Tasa implícita del momento del pedido
          const tasaReferencia = montoUsd > 0 ? (montoBs / montoUsd).toFixed(4) : 0;

          // 4. Registrar Liquidación con los nuevos campos
          await client.query(
              `INSERT INTO liquidaciones_repartidores 
              (pedido_id, repartidor_id, monto_total_pedido, porcentaje_app, 
               monto_comision_app, monto_repartidor, tasa_dolar_referencia, 
               monto_comision_usd, monto_repartidor_usd)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                  pedido_id, driverId, montoBs, porcentaje, 
                  comisionBs, netoRepartidorBs, tasaReferencia, 
                  comisionUsd, netoRepartidorUsd
              ]
          );

          await client.query(
              `UPDATE repartidores SET tiene_pedido = false, is_available = true, available_since = NOW() 
               WHERE usuario_id = $1`, [driverId]
          );
          await client.query(`UPDATE pedidos SET fecha_entrega = NOW() WHERE id = $1`, [pedido_id]);
      }

      await client.query("COMMIT");

      if (io) {
          io.to(cliente_id.toString()).emit('ORDEN_ACTUALIZADA', { pedido_id, nuevo_estado: status });
          if (status === 'entregado') assignPendingOrders(io);
      }

      res.json({ success: true, message: `Estado actualizado a ${status}` });

  } catch (error) {
      if (client) await client.query("ROLLBACK");
      console.error("❌ Error:", error);
      res.status(500).json({ success: false, error: error.message });
  } finally {
      client.release();
  }
};

// 4. Función específica para finalizar
export const completeOrder = async (req, res) => {
    req.body.status = 'entregado';
    return updateOrderStatus(req, res);
};

// import { pool } from "../../db.js";
// import { assignPendingOrders } from "../../services/assignmentServices.js";

// // 1. Cambiar Disponibilidad (Switch Manual)
// export const toggleAvailability = async (req, res) => {
//   const { available } = req.body;
//   const userId = req.userId;
//   const io = req.app.get("socketio");

//   try {
//     const query = `
//             UPDATE repartidores 
//             SET is_available = $1, 
//                 available_since = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE NULL END
//             WHERE usuario_id = $2
//             RETURNING is_available;
//         `;
//     const result = await pool.query(query, [available, userId]);

//     // Si se pone disponible, intentamos asignarle algo de la cola inmediatamente
//     if (result.rows[0]?.is_available && io) {
//       assignPendingOrders(io);
//     }

//     res.json({
//       success: true,
//       isAvailable: result.rows[0]?.is_available,
//     });
//   } catch (error) {
//     console.error("Error en toggleAvailability:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };

// // 2. Obtener estado actual (Sincronización para F5)
// // export const getCurrentOrder = async (req, res) => {
// //     const userId = req.userId;
// //     try {
// //       const driverRes = await pool.query(
// //         `SELECT is_available, is_active, tiene_pedido FROM repartidores WHERE usuario_id = $1`,
// //         [userId]
// //       );
  
// //       if (driverRes.rows.length === 0) {
// //         return res.status(404).json({ success: false, message: "Repartidor no encontrado" });
// //       }
  
// //       // Buscamos pedido: prioridad absoluta a lo que diga la tabla pedidos
// //       const orderQuery = `
// //               SELECT p.id as pedido_id, p.total_dolar as monto, p.estado,
// //                      u_c.nombre as cliente_nombre,
// //                      dir_o.calle as recogida, dir_d.calle as entrega
// //               FROM pedidos p
// //               JOIN usuarios u_c ON p.cliente_id = u_c.id
// //               JOIN direcciones dir_o ON p.direccion_origen_id = dir_o.id
// //               JOIN direcciones dir_d ON p.direccion_destino_id = dir_d.id
// //               WHERE p.repartidor_id = $1 
// //                 AND p.estado IN ('asignado', 'en_camino')
// //               ORDER BY p.fecha_pedido DESC
// //               LIMIT 1;
// //           `;
// //       const orderResult = await pool.query(orderQuery, [userId]);
// //       const hasOrder = orderResult.rows.length > 0;
  
// //       // Sincronización forzada: Si tiene pedido en la tabla, tiene_pedido debe ser true en repartidores
// //       if (hasOrder && !driverRes.rows[0].tiene_pedido) {
// //           await pool.query("UPDATE repartidores SET tiene_pedido = true, is_available = false WHERE usuario_id = $1", [userId]);
// //       }
  
// //       res.json({
// //         active: hasOrder,
// //         order: orderResult.rows[0] || null,
// //         isAvailableInDB: driverRes.rows[0].is_available,
// //         tiene_pedido: hasOrder ? true : driverRes.rows[0].tiene_pedido, 
// //         status: driverRes.rows[0].is_active,
// //       });
// //     } catch (error) {
// //       console.error("Error en getCurrentOrder:", error);
// //       res.status(500).json({ error: error.message });
// //     }
// //   };

// export const getCurrentOrder = async (req, res) => {
//   const usuarioId = req.userId; // ID que viene del middleware de sesión

//   try {
//     // 1. Verificar primero si existe en la tabla repartidores y su estado
//     const driverQuery = await pool.query(
//       "SELECT is_active, is_available FROM repartidores WHERE usuario_id = $1",
//       [usuarioId]
//     );

//     if (driverQuery.rowCount === 0) {
//       // Si no existe en la tabla repartidores, el Dashboard mostrará "Cuenta en revisión"
//       return res.status(200).json({ 
//         driverStatus: 'no_registrado', 
//         active: false 
//       });
//     }

//     const { is_active, is_available } = driverQuery.rows[0];

//     // 2. Si existe pero está suspendido
//     if (is_active !== 'activo') {
//       return res.status(200).json({ 
//         driverStatus: is_active, 
//         active: false 
//       });
//     }

//     // 3. Si está activo, buscamos si tiene un pedido pendiente
//     // Usamos JOIN para traer los nombres de cliente y servicio de una vez
//     const orderQuery = await pool.query(`
//       SELECT 
//         p.id as pedido_id, 
//         p.total as monto_bs, 
//         p.total_dolar as monto_usd, 
//         p.estado, 
//         u.nombre as cliente_nombre, 
//         u.telefono as cliente_telefono,
//         ts.descript as tipo_servicio,
//         d_orig.calle as recogida, 
//         d_dest.calle as entrega
//       FROM pedidos p
//       JOIN usuarios u ON p.cliente_id = u.id
//       JOIN tipos_servicios ts ON p.tipo_servicio_id = ts.id
//       JOIN direcciones d_orig ON p.direccion_origen_id = d_orig.id
//       JOIN direcciones d_dest ON p.direccion_destino_id = d_dest.id
//       WHERE p.repartidor_id = $1 AND p.estado IN ('asignado', 'en_camino')
//       LIMIT 1
//     `, [usuarioId]);

//     // 4. Respuesta completa para el Frontend
//     return res.status(200).json({
//       driverStatus: 'activo',
//       active: orderQuery.rowCount > 0,
//       isAvailableInDB: is_available,
//       order: orderQuery.rows[0] || null
//     });

//   } catch (error) {
//     console.error("❌ Error en getCurrentOrder:", error);
//     res.status(500).json({ error: "Error interno del servidor" });
//   }
// };
// // 3. Actualizar Estado del Pedido (Lógica centralizada)

// export const updateOrderStatus = async (req, res) => {
//     const { pedido_id, status } = req.body;
//     const driverId = req.userId;
//     const io = req.app.get('socketio');

//     const client = await pool.connect();

//     try {
//         await client.query("BEGIN");

//         // 1. Actualizamos el estado del pedido
//         const updateOrderQuery = `UPDATE pedidos SET estado = $1 WHERE id = $2 AND repartidor_id = $3 RETURNING id`;
//         const orderRes = await client.query(updateOrderQuery, [status, pedido_id, driverId]);

//         if (orderRes.rows.length === 0) {
//             throw new Error("Pedido no encontrado o no pertenece al repartidor");
//         }

//         // 2. Lógica según el nuevo estado
//         if (status === 'en_camino') {
//             await client.query(
//                 `UPDATE repartidores SET tiene_pedido = true, is_available = false WHERE usuario_id = $1`, 
//                 [driverId]
//             );
//         } 
//         else if (status === 'entregado') {
//             // ✅ CORRECCIÓN CRÍTICA: 
//             // Actualizamos available_since con NOW() para que el repartidor se vaya al FINAL de la cola.
//             // También mantenemos ultima_entrega_at para tus estadísticas.
//             await client.query(
//                 `UPDATE repartidores 
//                  SET tiene_pedido = false, 
//                      is_available = true, 
//                      available_since = NOW(), 
//                      ultima_entrega_at = NOW() 
//                  WHERE usuario_id = $1`, 
//                 [driverId]
//             );
            
//             // Registramos la fecha de entrega en el pedido
//             await client.query(`UPDATE pedidos SET fecha_entrega = NOW() WHERE id = $1`, [pedido_id]);
//         }

//         await client.query("COMMIT");

//         // 3. Notificaciones Socket
//         if (io) {
//             const clienteRes = await pool.query("SELECT cliente_id FROM pedidos WHERE id = $1", [pedido_id]);
//             if (clienteRes.rows[0]) {
//                 io.to(clienteRes.rows[0].cliente_id.toString()).emit('ORDEN_ACTUALIZADA', {
//                     pedido_id,
//                     nuevo_estado: status
//                 });
//             }

//             if (status === 'entregado') {
//                 // Como ahora el repartidor está libre y al final de la cola,
//                 // verificamos si hay pedidos esperando para los demás.
//                 assignPendingOrders(io);
//             }
//         }

//         res.json({ success: true, message: `Estado actualizado a ${status}` });

//     } catch (error) {
//         if (client) await client.query("ROLLBACK");
//         console.error("Error en updateOrderStatus:", error);
//         res.status(500).json({ success: false, error: error.message });
//     } finally {
//         client.release();
//     }
// };


// // 4. Finalizar pedido (Alias para compatibilidad si el front lo llama directo)
// export const completeOrder = (req, res) => {
//     req.body.status = 'entregado';
//     return updateOrderStatus(req, res);
// };

