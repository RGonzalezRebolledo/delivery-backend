import { pool } from "../../db.js";

export const getAdminDashboardStats = async (req, res) => {
  try {
    // 1. Relación de pagos pendientes a conductores (Total acumulado)
    const pagosPendientesQuery = `
            SELECT 
                COUNT(*) FILTER (WHERE estado_pago_repartidor = 'pendiente') as pedidos_por_liquidar,
                SUM(monto_repartidor) FILTER (WHERE estado_pago_repartidor = 'pendiente') as total_bs_pendiente,
                SUM(monto_repartidor_usd) FILTER (WHERE estado_pago_repartidor = 'pendiente') as total_usd_pendiente
            FROM liquidaciones_repartidores;
        `;

    // 2. Ganancias de Gazzella (Mes actual)
    const gananciasAppQuery = `
            SELECT 
                SUM(monto_comision_app) as total_bs_ganado,
                SUM(monto_comision_usd) as total_usd_ganado
            FROM liquidaciones_repartidores
            WHERE DATE_TRUNC('month', fecha_proceso) = DATE_TRUNC('month', CURRENT_DATE);
        `;

    // 3. Cantidad de pedidos en el mes (Por estado)
    const pedidosMesQuery = `
            SELECT 
                COUNT(*) as total_pedidos,
                COUNT(*) FILTER (WHERE estado = 'entregado') as completados,
                COUNT(*) FILTER (WHERE estado = 'pendiente') as en_espera
            FROM pedidos
            WHERE DATE_TRUNC('month', fecha_pedido) = DATE_TRUNC('month', CURRENT_DATE);
        `;

    // 4. Resumen por Repartidor (Top 5 con más entregas)
    const rankingRepartidoresQuery = `
            SELECT 
                u.nombre,
                COUNT(l.id) as entregas,
                SUM(l.monto_repartidor_usd) as ganado_usd
            FROM liquidaciones_repartidores l
            JOIN usuarios u ON l.repartidor_id = u.id
            GROUP BY u.nombre
            ORDER BY entregas DESC
            LIMIT 5;
        `;

    // 5. Histórico de ventas de los últimos 15 días (Para el gráfico de líneas)
    const historicoVentasQuery = `
            SELECT 
                TO_CHAR(fecha_pedido, 'DD/MM') as fecha,
                COUNT(*) as total_pedidos,
                SUM(total_dolar) as monto_usd
            FROM pedidos
            WHERE fecha_pedido >= CURRENT_DATE - INTERVAL '15 days'
            GROUP BY TO_CHAR(fecha_pedido, 'DD/MM'), DATE_TRUNC('day', fecha_pedido)
            ORDER BY DATE_TRUNC('day', fecha_pedido) ASC;
        `;

    // Ejecución de todas las consultas en paralelo
    const [pagos, ganancias, pedidos, ranking, historico] = await Promise.all([
      pool.query(pagosPendientesQuery),
      pool.query(gananciasAppQuery),
      pool.query(pedidosMesQuery),
      pool.query(rankingRepartidoresQuery),
      pool.query(historicoVentasQuery),
    ]);

    res.json({
      pagosPendientes: pagos.rows[0],
      gananciasGazzella: ganancias.rows[0],
      pedidosMes: pedidos.rows[0],
      topRepartidores: ranking.rows,
      historicoVentas: historico.rows,
    });
  } catch (error) {
    console.error("❌ Error en Dashboard:", error);
    res.status(500).json({ error: "Error al cargar estadísticas del sistema" });
  }
};
