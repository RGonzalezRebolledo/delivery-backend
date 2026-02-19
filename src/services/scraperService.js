
import axios from 'axios';
import * as cheerio from 'cheerio';
import {pool} from '../db.js';

export const runBcvScraper = async () => {
    try {
        console.log("🌐 Conectando al portal del BCV...");
        const { data } = await axios.get('https://www.bcv.org.ve/', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000 
        });

        const $ = cheerio.load(data);
        // Intentamos obtener el texto del contenedor del dólar
        const rateRaw = $('#dolar strong').text().trim();
        
        console.log(`Buscando selector #dolar strong... Resultado: "${rateRaw}"`);

        if (!rateRaw) {
            console.error("❌ No se encontró el texto del dólar en el HTML.");
            return null;
        }

        const cleanRate = parseFloat(rateRaw.replace('.', '').replace(',', '.'));
        console.log(`🔢 Tasa procesada: ${cleanRate}`);

        // IMPORTANTE: Verifica que estés usando { pool } o pool según tu archivo db.js
        await pool.query(
            'INSERT INTO exchange_rates (rate, currency, updated_at) VALUES ($1, $2, NOW())',
            [cleanRate, 'USD']
        );

        console.log("✅ Tasa guardada exitosamente en PostgreSQL.");
        return cleanRate;
    } catch (error) {
        console.error("❌ Error detallado en Scraper:", error.message);
        return null;
    }
};



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
