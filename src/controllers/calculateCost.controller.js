import axios from 'axios';

// URL de la API de la tasa de cambio (DolarVzla)
const EXTERNAL_RATE_API = 'https://api.dolarvzla.com/public/exchange-rate';
const DOLARVZLA_KEY = 'd419286ffbe7c65652922df241fe35b68dbedd25b9ee9d9600b2d7e56ac5c657';

// CONFIGURACIÓN DE MAPBOX
// Reemplaza con tu Token real de Mapbox (empieza por pk.ey...)
const MAPBOX_TOKEN = 'Tpk.eyJ1IjoicmFtb25nb256YWxlejEwMSIsImEiOiJjbWxmZnZ3M3EwMWh1M2Zva2owYnhrN2UwIn0.C9KJW65YVky5K6KkeZEZAg'; 

// LÓGICA DE NEGOCIO (Ajusta estos valores según tus tarifas)
const PRICE_PER_KM = 0.50; // Ejemplo: 0.50$ por cada kilómetro recorrido
const BASE_FEE = 1.50;     // Tarifa base inicial (banderazo)

/**
 * Función auxiliar para obtener la tasa de cambio actual.
 */
const fetchCurrentExchangeRate = async () => {
    try {
        const response = await axios.get(EXTERNAL_RATE_API, {
            headers: { 
                'Accept': 'application/json',
                'x-dolarvzla-key': DOLARVZLA_KEY
            }
        });
        const data = response.data;

        if (data && data.current && data.current.usd) {
            return parseFloat(data.current.usd);
        }
        throw new Error('Formato de tasa de cambio incorrecto.');
    } catch (error) {
        console.error("Error al obtener la tasa de cambio:", error.message);
        return 0.00; // Fallback
    }
};

/**
 * Controlador para calcular el costo del delivery basado en Mapbox.
 * POST /api/delivery/calculate-cost
 */
export const calculateDeliveryCost = async (req, res) => {
    // IMPORTANTE: El frontend ahora debe enviar pickupCoords y deliveryCoords como [lng, lat]
    const { pickupAddress, deliveryAddress, pickupCoords, deliveryCoords } = req.body;

    // 1. Validar entradas
    if (!pickupAddress || !deliveryAddress) {
        return res.status(400).json({ error: 'Las direcciones son obligatorias.' });
    }

    if (!pickupCoords || !deliveryCoords) {
        return res.status(400).json({ 
            error: 'Se requieren coordenadas geográficas para calcular la distancia exacta.' 
        });
    }

    try {
        // 2. Consultar distancia real a Mapbox Directions API
        // Formato: /driving/{lng_origen},{lat_origen};{lng_destino},{lat_destino}
        const mapboxUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${pickupCoords[0]},${pickupCoords[1]};${deliveryCoords[0]},${deliveryCoords[1]}?access_token=${MAPBOX_TOKEN}`;
        
        const mapboxResponse = await axios.get(mapboxUrl);

        if (!mapboxResponse.data.routes || mapboxResponse.data.routes.length === 0) {
            return res.status(404).json({ error: 'No se pudo encontrar una ruta entre ambos puntos.' });
        }

        // Distancia en metros convertida a kilómetros
        const distanceMeters = mapboxResponse.data.routes[0].distance;
        const distanceKm = distanceMeters / 1000;

        // 3. Calcular precio en USD
        // Fórmula: Base + (Kilómetros * Precio por KM)
        const priceUSD = BASE_FEE + (distanceKm * PRICE_PER_KM);

        // 4. Obtener tasa de cambio y calcular en VES
        const exchangeRate = await fetchCurrentExchangeRate();
        const priceVES = priceUSD * exchangeRate;

        // 5. Responder al frontend
        res.status(200).json({
            priceUSD: parseFloat(priceUSD.toFixed(2)),
            priceVES: parseFloat(priceVES.toFixed(2)),
            exchangeRate: parseFloat(exchangeRate.toFixed(2)),
            distanceKm: parseFloat(distanceKm.toFixed(2)),
            message: `Ruta de ${distanceKm.toFixed(2)} km calculada exitosamente.`
        });

    } catch (error) {
        console.error("Error en calculateDeliveryCost (Mapbox):", error.message);
        res.status(500).json({ error: 'Error interno al procesar la ruta y el costo.' });
    }
};




// import axios from 'axios';
// // Importamos la lógica de zonas del servicio
// import { getDeliveryPrice } from '../services/deliveryPriceService.js'; 

// // URL de la API de la tasa de cambio (DolarVzla)
// const EXTERNAL_RATE_API = 'https://api.dolarvzla.com/public/exchange-rate';
// // Reemplaza esto con tu clave real
// const DOLARVZLA_KEY = 'd419286ffbe7c65652922df241fe35b68dbedd25b9ee9d9600b2d7e56ac5c657';

// /**
//  * Función auxiliar para obtener la tasa de cambio actual.
//  * @returns {Promise<number>} La tasa de cambio VES/USD.
//  */
// const fetchCurrentExchangeRate = async () => {
//     try {
//         const response = await axios.get(EXTERNAL_RATE_API, {
//             headers: { 'Accept': 'application/json',
//             'x-dolarvzla-key': DOLARVZLA_KEY
//         }
//         });
//         const data = response.data;

//         if (data && data.current && data.current.usd) {
//             // Devolvemos la tasa USD
//             return parseFloat(data.current.usd);
//         }

//         // Si la estructura no es la esperada, lanzar un error
//         throw new Error('Formato de tasa de cambio incorrecto.');

//     } catch (error) {
//         console.error("Error al obtener la tasa de cambio para el cálculo:", error.message);
//         // Fallback: Usar una tasa de emergencia en caso de fallo
//         return 0.00; 
//     }
// };


// /**
//  * Controlador para calcular el costo del delivery basado en las direcciones
//  * y la tasa de cambio actual.
//  * POST /api/delivery/calculate-cost
//  */
// export const calculateDeliveryCost = async (req, res) => {
//     // Recibimos las direcciones y peso (si es necesario) del cliente
//     const { pickupAddress, deliveryAddress, weightKg } = req.body;

//     // 1. Validar inputs básicos
//     if (!pickupAddress || !deliveryAddress) {
//         return res.status(400).json({ error: 'Las direcciones de recogida y entrega son obligatorias.' });
//     }

//     try {
//         // 2. Calcular el precio base en USD usando la lógica de Zonas
//         // Pasamos los argumentos necesarios a getDeliveryPrice si el servicio los usa
//         const priceUSD = getDeliveryPrice(pickupAddress, deliveryAddress);

//         // Si getDeliveryPrice devuelve 0, es una zona no cubierta/desconocida
//         if (priceUSD === 0) {
//             return res.status(404).json({ 
//                 error: 'Ruta no cubierta o dirección desconocida. Por favor, verifica la dirección o contacta a soporte.',
//                 priceUSD: 0
//             });
//         }

//         // 3. Obtener la tasa de cambio actual
//         const exchangeRate = await fetchCurrentExchangeRate();

//         // 4. Calcular el precio en VES
//         const priceVES = priceUSD * exchangeRate;

//         // 5. Devolver los resultados al frontend
//         res.status(200).json({
//             priceUSD: parseFloat(priceUSD.toFixed(2)),
//             priceVES: parseFloat(priceVES.toFixed(2)),
//             exchangeRate: parseFloat(exchangeRate.toFixed(2)),
//             message: `Costo calculado para la ruta: $${priceUSD.toFixed(2)} (${priceVES.toFixed(2)} VES).`
//         });

//     } catch (error) {
//         console.error("Error en el cálculo del costo de delivery:", error);
//         res.status(500).json({ error: 'Error interno del servidor al calcular el costo.' });
//     }
// };