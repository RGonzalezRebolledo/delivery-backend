
import {pool} from '../../db.js';

export const getBcvExchangeRate = async (req, res) => {
    try {
        // Consultamos el último registro insertado
        const result = await pool.query(
            'SELECT rate, updated_at FROM exchange_rates ORDER BY updated_at DESC LIMIT 1'
        );

        if (result.rows.length > 0) {
            const data = result.rows[0];
            return res.status(200).json({
                currency: 'USD',
                rate: parseFloat(data.rate),
                source: 'BCV (Cache Interno)',
                last_updated: data.updated_at
            });
        }

        return res.status(404).json({ error: 'No hay tasas registradas aún.' });

    } catch (error) {
        console.error("Error al obtener tasa local:", error.message);
        return res.status(500).json({ error: 'Error al consultar la base de datos.' });
    }
};

// import axios from 'axios';

// /**
//  * Endpoint para obtener la tasa de cambio desde api.dolarvzla.com
//  */
// export const getBcvExchangeRate = async (req, res) => {
//     // Nueva URL proporcionada
//     const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL;

//     try {
//         const response = await axios.get(EXTERNAL_API_URL, {
//             headers: { 'Accept': 'application/json' }
//         });

//         const data = response.data;
        
//         // 1. Validamos que la estructura JSON sea la esperada:
//         // { "current": { "usd": 257.9287, ... } }
//         if (data && data.current && data.current.usd) {
            
//             const rate = data.current.usd; // Extraemos el valor del dólar
//             const date = data.current.date; // Extraemos la fecha

//             // 2. Enviamos la respuesta limpia al frontend
//             return res.status(200).json({
//                 currency: 'USD',
//                 rate: parseFloat(rate),
//                 source: 'API DolarVzla',
//                 last_updated: date || new Date().toISOString()
//             });
//         }
        
//         // Si el API responde pero no tiene el campo 'current.usd'
//         throw new Error('El formato de respuesta del API ha cambiado o es incorrecto.');

//     } catch (error) {
//         console.error("Error al obtener la tasa de cambio:", error.message);
        
//         // Devolver una tasa de fallback o un error
//         return res.status(500).json({ 
//             error: 'No se pudo obtener la tasa de cambio externa.',
//             // Usamos un fallback cercano al valor real por si acaso
//             fallbackRate: 0.0 
//         });
//     }
// };


// import axios from 'axios';

// /**
//  * Endpoint para obtener la tasa de cambio oficial del BCV.
//  * * NOTA: Dado que el BCV no tiene un API público oficial, 
//  * este código usa una URL de servicio proxy común para el BCV.
//  * Si usas un servicio de terceros (ej: DolarToday, un proxy privado), 
//  * reemplaza la URL y ajusta la extracción de datos.
//  */
// export const getBcvExchangeRate = async (req, res) => {
//     // Usamos un proxy URL común para obtener la tasa BCV del día
//     const EXTERNAL_API_URL = 'https://api.dolarvzla.com/public/exchange-rate';

//     try {
//         const response = await axios.get(EXTERNAL_API_URL, {
//             // Esto ayuda a algunos APIs a evitar errores de User-Agent
//             headers: { 'Accept': 'application/json' }
//         });

//         const data = response.data;
        
//         // Verificamos si la data tiene la estructura esperada
//         if (data && data.price) {
//             // La tasa es el campo 'price' que devuelve el API (ej: 36.50)
//             const rate = data.price; 
            
//             // Enviamos la respuesta limpia al frontend
//             return res.status(200).json({
//                 currency: 'USD',
//                 rate: parseFloat(rate),
//                 source: 'BCV (Proxy)',
//                 last_updated: new Date().toISOString()
//             });
//         }
        
//         // Si el formato de la respuesta externa es inesperado
//         throw new Error('Formato de datos BCV no reconocido.');

//     } catch (error) {
//         console.error("Error al obtener la tasa de cambio del BCV:", error.message);
        
//         // Devolver una tasa de fallback o un error
//         return res.status(500).json({ 
//             error: 'No se pudo obtener la tasa de cambio.',
//             fallbackRate: 36.00 // Tasa manual de emergencia si el API externo falla
//         });
//     }
// };