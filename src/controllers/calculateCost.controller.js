import axios from 'axios';

const EXTERNAL_RATE_API = process.env.EXTERNAL_RATE_API?.trim();
const DOLARVZLA_KEY = process.env.DOLARVZLA_KEY?.trim();
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN?.trim();

const PRICE_PER_KM = 0.50; // Ajustado de 0.0 a 0.50 para que el cálculo tenga sentido
const BASE_FEE = 1.50;

/**
 * Obtiene la tasa de cambio. 
 * Si falla, retorna una tasa base para evitar que el total sea 0.
 */
const fetchCurrentExchangeRate = async () => {
    try {
        // Log para verificar en Railway que las URLs están cargando
        console.log("Consultando tasa en:", EXTERNAL_RATE_API);

        const response = await axios.get(EXTERNAL_RATE_API, {
            headers: { 
                'Accept': 'application/json',
                'x-dolarvzla-key': DOLARVZLA_KEY
            },
            timeout: 5000 // Si en 5 segundos no responde, saltar al catch
        });

        if (response.data?.current?.usd) {
            return parseFloat(response.data.current.usd);
        }
        return 0;
    } catch (error) {
        console.error("⚠️ Error API Tasa Cambio:", error.message);
        // RETORNAMOS 0 en lugar de romper el servidor
        return 0;
    }
};

export const calculateDeliveryCost = async (req, res) => {
    const { pickupAddress, deliveryAddress, pickupCoords, deliveryCoords } = req.body;

    if (!pickupCoords || !deliveryCoords) {
        return res.status(400).json({ error: 'Faltan coordenadas para el cálculo.' });
    }

    try {
        const p_lng = Array.isArray(pickupCoords) ? pickupCoords[0] : pickupCoords.lng;
        const p_lat = Array.isArray(pickupCoords) ? pickupCoords[1] : pickupCoords.lat;
        const d_lng = Array.isArray(deliveryCoords) ? deliveryCoords[0] : deliveryCoords.lng;
        const d_lat = Array.isArray(deliveryCoords) ? deliveryCoords[1] : deliveryCoords.lat;

        // 1. Llamada a Mapbox
        const mapboxUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${p_lng},${p_lat};${d_lng},${d_lat}?access_token=${MAPBOX_TOKEN}`;
        const mapboxResponse = await axios.get(mapboxUrl);

        if (!mapboxResponse.data.routes?.length) {
            return res.status(404).json({ error: 'No se encontró ruta entre los puntos.' });
        }

        const distanceKm = mapboxResponse.data.routes[0].distance / 1000;
        
        // 2. Cálculos
        const priceUSD = BASE_FEE + (distanceKm * PRICE_PER_KM);
        let exchangeRate = await fetchCurrentExchangeRate();

        // 3. Fallback: Si la tasa es 0 (falló la API), podrías poner una tasa manual 
        // o dejarla en 0 pero avisar al usuario.
        const priceVES = priceUSD * exchangeRate;

        // 4. Respuesta
        res.status(200).json({
            priceUSD: parseFloat(priceUSD.toFixed(2)),
            priceVES: parseFloat(priceVES.toFixed(2)),
            exchangeRate: parseFloat(exchangeRate.toFixed(2)),
            distanceKm: parseFloat(distanceKm.toFixed(2)),
            success: true
        });

    } catch (error) {
        console.error("Error crítico en controlador:", error.response?.data || error.message);
        
        // Manejo específico de error de Mapbox
        if (error.response?.status === 401) {
            return res.status(401).json({ error: 'Token de Mapbox inválido en el servidor.' });
        }

        res.status(500).json({ error: 'Error al calcular el costo de entrega.' });
    }
};


// import axios from 'axios';

// // URL de la API de la tasa de cambio (DolarVzla)
// // const EXTERNAL_RATE_API = process.env.EXTERNAL_RATE_API;
// // const DOLARVZLA_KEY = process.env.DOLARVZLA_KEY;

// // // CONFIGURACIÓN DE MAPBOX - ¡TOKEN CORREGIDO! (Sin la T al principio)
// // const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN; 

// const EXTERNAL_RATE_API = process.env.EXTERNAL_RATE_API?.trim();
// const DOLARVZLA_KEY = process.env.DOLARVZLA_KEY?.trim();
// const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN?.trim();

// // LÓGICA DE NEGOCIO
// const PRICE_PER_KM = 0.0; // 0.50$ por cada kilómetro
// const BASE_FEE = 1.50;     // Tarifa base inicial

// /**
//  * Función auxiliar para obtener la tasa de cambio actual.
//  */
// const fetchCurrentExchangeRate = async () => {
//     try {
//         console.log("Token enviado a Mapbox:", process.env.MAPBOX_TOKEN?.substring(0, 5) + "...");
//         const response = await axios.get(EXTERNAL_RATE_API, {
//             headers: { 
//                 'Accept': 'application/json',
//                 'x-dolarvzla-key': DOLARVZLA_KEY
//             }
//         });
//         const data = response.data;

//         if (data && data.current && data.current.usd) {
//             return parseFloat(data.current.usd);
//         }
//         throw new Error('Formato de tasa de cambio incorrecto.');
//     } catch (error) {
//         // Esto nos dirá en el log exactamente qué token se intentó usar
//         const tokenUsado = process.env.MAPBOX_TOKEN || "ESTÁ VACÍO";
//         console.error("DEBUG - Token detectado:", tokenUsado.substring(0, 5));
        
//         res.status(500).json({ 
//             error: 'Error de validación de mapa',
//             debug_token_prefix: tokenUsado.substring(0, 3) // Nos dirá si empieza por 'pk.' o 'Tpk' o 'und'
//         });
//     }
// };

// /**
//  * Controlador para calcular el costo del delivery basado en Mapbox.
//  * POST /api/delivery/calculate-cost
//  */
// export const calculateDeliveryCost = async (req, res) => {
//     const { pickupAddress, deliveryAddress, pickupCoords, deliveryCoords } = req.body;

//     // 1. Validar entradas básicas
//     if (!pickupAddress || !deliveryAddress) {
//         return res.status(400).json({ error: 'Las direcciones son obligatorias.' });
//     }

//     if (!pickupCoords || !deliveryCoords) {
//         return res.status(400).json({ 
//             error: 'Se requieren coordenadas geográficas para el cálculo.' 
//         });
//     }

//     try {
//         // 2. Extraer Lat/Lng con soporte para múltiples formatos [lng, lat] o {lat, lng}
//         const p_lng = Array.isArray(pickupCoords) ? pickupCoords[0] : pickupCoords.lng;
//         const p_lat = Array.isArray(pickupCoords) ? pickupCoords[1] : pickupCoords.lat;
        
//         const d_lng = Array.isArray(deliveryCoords) ? deliveryCoords[0] : deliveryCoords.lng;
//         const d_lat = Array.isArray(deliveryCoords) ? deliveryCoords[1] : deliveryCoords.lat;

//         // Validar que tengamos números válidos
//         if (!p_lng || !p_lat || !d_lng || !d_lat) {
//             return res.status(400).json({ error: 'Formato de coordenadas inválido.' });
//         }

//         // 3. Consultar distancia real a Mapbox Directions API
//         // Formato: /driving/{lng_origen},{lat_origen};{lng_destino},{lat_destino}
//         const mapboxUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${p_lng},${p_lat};${d_lng},${d_lat}?access_token=${MAPBOX_TOKEN}`;
        
//         const mapboxResponse = await axios.get(mapboxUrl);

//         if (!mapboxResponse.data.routes || mapboxResponse.data.routes.length === 0) {
//             return res.status(404).json({ error: 'No se pudo encontrar una ruta entre ambos puntos.' });
//         }

//         // Distancia en metros convertida a kilómetros
//         const distanceMeters = mapboxResponse.data.routes[0].distance;
//         const distanceKm = distanceMeters / 1000;

//         // 4. Calcular precio en USD
//         // Fórmula: Base + (Kilómetros * Precio por KM)
//         const priceUSD = BASE_FEE + (distanceKm * PRICE_PER_KM);

//         // 5. Obtener tasa de cambio y calcular en VES
//         const exchangeRate = await fetchCurrentExchangeRate();
        
//         // Si la tasa falla (es 0), el costo VES será 0 temporalmente
//         const priceVES = exchangeRate > 0 ? (priceUSD * exchangeRate) : 0;

//         // 6. Responder al frontend
//         res.status(200).json({
//             priceUSD: parseFloat(priceUSD.toFixed(2)),
//             priceVES: parseFloat(priceVES.toFixed(2)),
//             exchangeRate: parseFloat(exchangeRate.toFixed(2)),
//             distanceKm: parseFloat(distanceKm.toFixed(2)),
//             message: `Ruta de ${distanceKm.toFixed(2)} km calculada exitosamente.`
//         });

//     } catch (error) {
//         // Log detallado para depuración en Railway
//         console.error("Error en calculateDeliveryCost:", {
//             message: error.message,
//             status: error.response?.status,
//             data: error.response?.data
//         });

//         // Si Mapbox responde con error de Token (401 o 403)
//         if (error.response?.status === 401 || error.response?.status === 403) {
//             return res.status(500).json({ error: 'Error de autenticación con el servicio de mapas.' });
//         }

//         res.status(500).json({ error: 'Error interno al procesar la ruta y el costo.' });
//     }
// };



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