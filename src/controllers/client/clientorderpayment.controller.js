import { verifyMercantilPayment } from '../../services/payment.service.js';
import pool from '../db.js';

export const createOrderWithPayment = async (req, res) => {
    const { orderPayload, paymentData } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Inicio de transacción SQL

        // 1. Verificar el pago con la API de Mercantil
        const bankAuth = await verifyMercantilPayment(paymentData);

        if (bankAuth.extraction_status !== 'COMPLETED') {
            throw new Error('El pago no pudo ser verificado por el banco.');
        }

        // 2. Crear la Orden en la DB
        const newOrder = await client.query(
            `INSERT INTO orders (client_id, pickup, delivery, total_ves, status) 
             VALUES ($1, $2, $3, $4, 'paid') RETURNING id`,
            [req.user.id, orderPayload.pickup, orderPayload.delivery, orderPayload.price]
        );

        const orderId = newOrder.rows[0].id;

        // 3. Registrar el pago exitoso
        await client.query(
            `INSERT INTO payments (order_id, reference_number, payer_phone, amount_ves, status, bank_response_id)
             VALUES ($1, $2, $3, $4, 'success', $5)`,
            [orderId, paymentData.referencia, paymentData.telefono, paymentData.monto, bankAuth.txId]
        );

        await client.query('COMMIT');
        res.status(201).json({ success: true, orderId });

    } catch (error) {
        await client.query('ROLLBACK'); // Si algo falla, no se guarda nada
        res.status(400).json({ error: error.message });
    } finally {
        client.release();
    }
};