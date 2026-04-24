import cron from 'node-cron';
import { pool } from '../db.js';

// Esta tarea se ejecuta CADA MINUTO
cron.schedule('* * * * *', async () => {
    console.log('🤖 Verificando pedidos expirados...');
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Buscamos pedidos que lleven más de 2 minutos en 'asignado'
        // y que aún no hayan sido aceptados ('en camino')
        const expiredOrdersQuery = `
            UPDATE pedidos 
            SET estado = 'pendiente', 
                repartidor_id = NULL 
            WHERE estado = 'asignado' 
            AND fecha_pedido < NOW() - INTERVAL '2 minutes'
            RETURNING id, repartidor_id;
        `;
        
        const result = await client.query(expiredOrdersQuery);

        if (result.rowCount > 0) {
            console.log(`⚠️ Se liberaron ${result.rowCount} pedidos por inactividad.`);
            
            // 2. Penalizamos a los conductores enviándolos al final de la cola
            for (const row of result.rows) {
                await client.query(
                    `UPDATE repartidores 
                     SET is_available = true, available_since = NOW() 
                     WHERE usuario_id = $1`,
                    [row.repartidor_id]
                );
            }
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error en el Cron de limpieza:', error);
    } finally {
        client.release();
    }
});