import { pool } from '../../db.js';

export const getClientOrders = async (req, res) => {
    const clienteId = req.userId; 

    if (!clienteId) return res.status(401).json({ error: 'No autorizado' });

    try {
        const result = await pool.query(
            `SELECT 
                p.id,
                p.fecha_pedido,
                p.estado,
                p.total,
                p.total_dolar,
                p.nro_recibo,
                d.calle,
                d.ciudad,
                tv.descript AS vehiculo_descript,
                tv.amount_pay AS vehiculo_costo, -- Ajustado a 'amount_pay'
                ts.descript AS servicio_descript,
                ts.amount_pay AS servicio_costo   -- Ajustado a 'amount_pay'
             FROM pedidos p
             LEFT JOIN direcciones d ON p.direccion_destino_id = d.id
             LEFT JOIN tipos_vehiculos tv ON p.tipo_vehiculo_id = tv.id
             LEFT JOIN tipos_servicios ts ON p.tipo_servicio_id = ts.id
             WHERE p.cliente_id = $1
             ORDER BY p.fecha_pedido DESC`,
            [clienteId]
        );

        const orders = result.rows.map(order => ({
            id: order.id,
            date: new Date(order.fecha_pedido).toLocaleDateString('es-ES', { 
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
            }),
            status: order.estado,
            total: parseFloat(order.total).toFixed(2),
            total_usd: parseFloat(order.total_dolar).toFixed(2),
            address: order.calle ? `${order.calle}` : 'Dirección no disponible',
            receipt: order.nro_recibo,
            typevehicle: order.vehiculo_descript || 'No especificado',
            typeservice: order.servicio_descript || 'Estándar',
            // Desglose con el campo amount_pay
            breakdown: {
                vehicle_base: parseFloat(order.vehiculo_costo || 0).toFixed(2),
                service_extra: parseFloat(order.servicio_costo || 0).toFixed(2)
            }
        }));

        res.status(200).json(orders);

    } catch (error) {
        console.error("ERROR SQL:", error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};




// import { pool } from '../../db.js';

// export const getClientOrders = async (req, res) => {
//     const clienteId = req.userId; 

//     if (!clienteId) return res.status(401).json({ error: 'No autorizado' });

//     try {
//         const result = await pool.query(
//             `SELECT 
//                 p.id,
//                 p.fecha_pedido,
//                 p.estado,
//                 p.total,
//                 p.total_dolar,
//                 p.nro_recibo,
//                 d.calle,   -- Cambiado de 'direccion' a 'calle' según tu tabla
//                 d.ciudad
//              FROM pedidos p
//              LEFT JOIN direcciones d ON p.direccion_destino_id = d.id
//              WHERE p.cliente_id = $1
//              ORDER BY p.fecha_pedido DESC`,
//             [clienteId]
//         );

//         const orders = result.rows.map(order => ({
//             id: order.id,
//             date: new Date(order.fecha_pedido).toLocaleDateString('es-ES', { 
//                 day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
//             }),
//             status: order.estado,
//             total: parseFloat(order.total).toFixed(2),
//             total_usd: parseFloat(order.total_dolar).toFixed(2),
//             // Concatenamos calle y ciudad para que el cliente vea la ubicación clara
//             address: order.calle ? `${order.calle}` : 'Dirección no disponible',
//             receipt: order.nro_recibo
//         }));

//         res.status(200).json(orders);

//     } catch (error) {
//         // Esto saldrá en tu terminal de Node si algo más falla
//         console.error("ERROR SQL:", error.message);
//         res.status(500).json({ error: 'Error interno del servidor' });
//     }
// };