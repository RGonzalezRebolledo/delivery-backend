import { pool } from '../db.js';
import { getDeliveryPrice } from '../services/deliveryPriceService.js';

export const calculateDeliveryCost = async (req, res) => {
    const { pickupAddress, deliveryAddress } = req.body;

    if (!pickupAddress || !deliveryAddress) {
        return res.status(400).json({ error: 'Faltan direcciones para el cálculo.' });
    }

    try {
        // 1. Calcular precio base USD según Matriz de Zonas
        const priceUSD = getDeliveryPrice(pickupAddress, deliveryAddress);

        if (priceUSD === 0) {
            return res.status(404).json({ 
                error: 'Una de las direcciones no está en nuestra zona de cobertura.' 
            });
        }

        // 2. Obtener tasa de cambio de la DB
        const rateResult = await pool.query(
            'SELECT rate FROM exchange_rates ORDER BY updated_at DESC LIMIT 1'
        );
        
        const exchangeRate = rateResult.rows.length > 0 ? parseFloat(rateResult.rows[0].rate) : 0;

        // 3. Calcular en VES
        const priceVES = priceUSD * exchangeRate;

        res.status(200).json({
            priceUSD: parseFloat(priceUSD.toFixed(2)),
            priceVES: parseFloat(priceVES.toFixed(2)),
            exchangeRate: parseFloat(exchangeRate.toFixed(2)),
            success: true
        });

    } catch (error) {
        console.error("Error en cálculo por zonas:", error.message);
        res.status(500).json({ error: 'Error interno al calcular costo.' });
    }
};


// import axios from 'axios';
// import {pool} from '../db.js'; // Asegúrate de que la ruta a tu conexión de PostgreSQL sea correcta

// const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN?.trim();

// const PRICE_PER_KM = 0.50; 
// const BASE_FEE = 1.50;

// /**
//  * Obtiene la tasa de cambio más reciente desde tu base de datos PostgreSQL.
//  */
// const fetchCurrentExchangeRateFromDB = async () => {
//     try {
//         // Consultamos el último registro insertado por el scraper
//         const result = await pool.query(
//             'SELECT rate FROM exchange_rates ORDER BY updated_at DESC LIMIT 1'
//         );

//         if (result.rows.length > 0) {
//             return parseFloat(result.rows[0].rate);
//         }
        
//         console.warn("⚠️ No se encontró ninguna tasa en la base de datos.");
//         return 0;
//     } catch (error) {
//         console.error("⚠️ Error consultando tasa en DB local:", error.message);
//         return 0;
//     }
// };

// export const calculateDeliveryCost = async (req, res) => {
//     const { pickupAddress, deliveryAddress, pickupCoords, deliveryCoords } = req.body;

//     if (!pickupCoords || !deliveryCoords) {
//         return res.status(400).json({ error: 'Faltan coordenadas para el cálculo.' });
//     }

//     try {
//         const p_lng = Array.isArray(pickupCoords) ? pickupCoords[0] : pickupCoords.lng;
//         const p_lat = Array.isArray(pickupCoords) ? pickupCoords[1] : pickupCoords.lat;
//         const d_lng = Array.isArray(deliveryCoords) ? deliveryCoords[0] : deliveryCoords.lng;
//         const d_lat = Array.isArray(deliveryCoords) ? deliveryCoords[1] : deliveryCoords.lat;

//         // 1. Llamada a Mapbox para obtener la distancia real por carretera
//         const mapboxUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${p_lng},${p_lat};${d_lng},${d_lat}?access_token=${MAPBOX_TOKEN}`;
//         const mapboxResponse = await axios.get(mapboxUrl);

//         if (!mapboxResponse.data.routes?.length) {
//             return res.status(404).json({ error: 'No se encontró ruta entre los puntos.' });
//         }

//         const distanceKm = mapboxResponse.data.routes[0].distance / 1000;
        
//         // 2. Cálculos de precio en USD
//         const priceUSD = BASE_FEE + (distanceKm * PRICE_PER_KM);

//         // 3. Obtención de la tasa desde tu Base de Datos (en lugar de la API externa)
//         let exchangeRate = await fetchCurrentExchangeRateFromDB();

//         // 4. Cálculo en VES (Si la tasa es 0 por algún error, el precio VES será 0)
//         const priceVES = priceUSD * exchangeRate;

//         // 5. Respuesta enviada al frontend
//         res.status(200).json({
//             priceUSD: parseFloat(priceUSD.toFixed(2)),
//             priceVES: parseFloat(priceVES.toFixed(2)),
//             exchangeRate: parseFloat(exchangeRate.toFixed(2)),
//             distanceKm: parseFloat(distanceKm.toFixed(2)),
//             success: true,
//             source: 'DB Local (BCV)' // Informativo para saber que ya no usa la API externa
//         });

//     } catch (error) {
//         console.error("Error crítico en controlador:", error.response?.data || error.message);
        
//         if (error.response?.status === 401) {
//             return res.status(401).json({ error: 'Token de Mapbox inválido.' });
//         }

//         res.status(500).json({ error: 'Error al calcular el costo de entrega.' });
//     }
// };

