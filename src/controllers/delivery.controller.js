import axios from 'axios';
// Importamos la lógica de zonas del servicio
import { getDeliveryPrice } from '../services/deliveryPriceService.js'; 

// URL de la API de la tasa de cambio (DolarVzla)
const EXTERNAL_RATE_API = 'https://api.dolarvzla.com/public/exchange-rate';
// Reemplaza esto con tu clave real
const DOLARVZLA_KEY = 'd419286ffbe7c65652922df241fe35b68dbedd25b9ee9d9600b2d7e56ac5c657';

/**
 * Función auxiliar para obtener la tasa de cambio actual.
 * @returns {Promise<number>} La tasa de cambio VES/USD.
 */
const fetchCurrentExchangeRate = async () => {
    try {
        const response = await axios.get(EXTERNAL_RATE_API, {
            headers: { 'Accept': 'application/json',
            'x-dolarvzla-key': DOLARVZLA_KEY
        }
        });
        const data = response.data;

        if (data && data.current && data.current.usd) {
            // Devolvemos la tasa USD
            return parseFloat(data.current.usd);
        }

        // Si la estructura no es la esperada, lanzar un error
        throw new Error('Formato de tasa de cambio incorrecto.');

    } catch (error) {
        console.error("Error al obtener la tasa de cambio para el cálculo:", error.message);
        // Fallback: Usar una tasa de emergencia en caso de fallo
        return 250.00; 
    }
};


/**
 * Controlador para calcular el costo del delivery basado en las direcciones
 * y la tasa de cambio actual.
 * POST /api/delivery/calculate-cost
 */
export const calculateDeliveryCost = async (req, res) => {
    // Recibimos las direcciones y peso (si es necesario) del cliente
    const { pickupAddress, deliveryAddress, weightKg } = req.body;

    // 1. Validar inputs básicos
    if (!pickupAddress || !deliveryAddress) {
        return res.status(400).json({ error: 'Las direcciones de recogida y entrega son obligatorias.' });
    }

    try {
        // 2. Calcular el precio base en USD usando la lógica de Zonas
        // Pasamos los argumentos necesarios a getDeliveryPrice si el servicio los usa
        const priceUSD = getDeliveryPrice(pickupAddress, deliveryAddress);

        // Si getDeliveryPrice devuelve 0, es una zona no cubierta/desconocida
        if (priceUSD === 0) {
            return res.status(404).json({ 
                error: 'Ruta no cubierta o dirección desconocida. Por favor, verifica la dirección o contacta a soporte.',
                priceUSD: 0
            });
        }

        // 3. Obtener la tasa de cambio actual
        const exchangeRate = await fetchCurrentExchangeRate();

        // 4. Calcular el precio en VES
        const priceVES = priceUSD * exchangeRate;

        // 5. Devolver los resultados al frontend
        res.status(200).json({
            priceUSD: parseFloat(priceUSD.toFixed(2)),
            priceVES: parseFloat(priceVES.toFixed(2)),
            exchangeRate: parseFloat(exchangeRate.toFixed(2)),
            message: `Costo calculado para la ruta: $${priceUSD.toFixed(2)} (${priceVES.toFixed(2)} VES).`
        });

    } catch (error) {
        console.error("Error en el cálculo del costo de delivery:", error);
        res.status(500).json({ error: 'Error interno del servidor al calcular el costo.' });
    }
};