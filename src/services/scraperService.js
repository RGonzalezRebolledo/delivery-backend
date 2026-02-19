import axios from 'axios';
import { pool } from '../db.js';

export const runBcvScraper = async () => {
    try {
        console.log("🌐 Consultando tasa oficial en ve.dolarapi.com...");
        
        const { data } = await axios.get('https://ve.dolarapi.com/v1/dolares/oficial', {
            timeout: 10000 
        });

        const cleanRate = parseFloat(data.promedio);
        // Extraemos la fecha oficial de actualización de la API
        const apiDate = data.fechaActualizacion; 

        if (!cleanRate || isNaN(cleanRate)) {
            console.error("❌ La API no devolvió un valor numérico válido.");
            return null;
        }

        console.log(`🔢 Tasa recibida: ${cleanRate} Bs. (Oficial: ${apiDate})`);

        // Guardar en PostgreSQL usando la fecha de la API ($3)
        await pool.query(
            'INSERT INTO exchange_rates (rate, currency, updated_at) VALUES ($1, $2, $3)',
            [cleanRate, 'USD', apiDate]
        );

        console.log("✅ Tasa guardada exitosamente con la fecha oficial de la API.");
        return cleanRate;

    } catch (error) {
        console.error("❌ Error al obtener tasa de DolarApi:");
        if (error.response) {
            console.error(`   Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(`   Mensaje: ${error.message}`);
        }
        return null;
    }
};

// import axios from 'axios';
// import * as cheerio from 'cheerio';
// import {pool} from '../db.js';

// export const runBcvScraper = async () => {
//     try {
//         console.log("🌐 Conectando al portal del BCV...");
//         const { data } = await axios.get('https://www.bcv.org.ve/', {
//             headers: { 'User-Agent': 'Mozilla/5.0' },
//             timeout: 10000 
//         });

//         const $ = cheerio.load(data);
//         // Intentamos obtener el texto del contenedor del dólar
//         const rateRaw = $('#dolar strong').text().trim();
        
//         console.log(`Buscando selector #dolar strong... Resultado: "${rateRaw}"`);

//         if (!rateRaw) {
//             console.error("❌ No se encontró el texto del dólar en el HTML.");
//             return null;
//         }

//         const cleanRate = parseFloat(rateRaw.replace('.', '').replace(',', '.'));
//         console.log(`🔢 Tasa procesada: ${cleanRate}`);

//         // IMPORTANTE: Verifica que estés usando { pool } o pool según tu archivo db.js
//         await pool.query(
//             'INSERT INTO exchange_rates (rate, currency, updated_at) VALUES ($1, $2, NOW())',
//             [cleanRate, 'USD']
//         );

//         console.log("✅ Tasa guardada exitosamente en PostgreSQL.");
//         return cleanRate;
//     } catch (error) {
//         console.error("❌ Error detallado en Scraper:", error.message);
//         return null;
//     }
// };



// export const runBcvScraper = async () => {
//     try {
//         const { data } = await axios.get('https://www.bcv.org.ve/', {
//             headers: { 'User-Agent': 'Mozilla/5.0' },
//             timeout: 8000 
//         });

//         const $ = cheerio.load(data);
//         const rateRaw = $('#dolar strong').text().trim();
        
//         if (!rateRaw) return null; // Devuelve null para disparar el reintento

//         const cleanRate = parseFloat(rateRaw.replace('.', '').replace(',', '.'));
        
//         await pool.query(
//             'INSERT INTO exchange_rates (rate, updated_at) VALUES ($1, NOW())',
//             [cleanRate]
//         );

//         return cleanRate; // Éxito
//     } catch (error) {
//         return null; // Error de conexión o servidor disparará el reintento
//     }
// };
