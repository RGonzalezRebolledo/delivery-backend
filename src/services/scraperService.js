import axios from 'axios';
import * as cheerio from 'cheerio';
import {pool} from '../db.js';

export const runBcvScraper = async () => {
    try {
        const { data } = await axios.get('https://www.bcv.org.ve/', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 8000 
        });

        const $ = cheerio.load(data);
        const rateRaw = $('#dolar strong').text().trim();
        
        if (!rateRaw) return null; // Devuelve null para disparar el reintento

        const cleanRate = parseFloat(rateRaw.replace('.', '').replace(',', '.'));
        
        await pool.query(
            'INSERT INTO exchange_rates (rate, updated_at) VALUES ($1, NOW())',
            [cleanRate]
        );

        return cleanRate; // Éxito
    } catch (error) {
        return null; // Error de conexión o servidor disparará el reintento
    }
};

// export const runBcvScraper = async () => {
//     const timestamp = new Date().toLocaleString();
//     console.log(`\n[${timestamp}] 🕒 Iniciando actualización programada...`);

//     try {
//         const { data } = await axios.get('https://www.bcv.org.ve/', {
//             headers: { 'User-Agent': 'Mozilla/5.0' },
//             timeout: 10000 // Si el BCV tarda más de 10s, cancelamos
//         });

//         const $ = cheerio.load(data);
//         const rateRaw = $('#dolar strong').text().trim();
        
//         if (!rateRaw) {
//             console.error(`[${timestamp}] ❌ Error: No se encontró el elemento #dolar en el HTML del BCV.`);
//             return null;
//         }

//         const cleanRate = parseFloat(rateRaw.replace('.', '').replace(',', '.'));

//         // Guardar en DB
//         const dbResult = await pool.query(
//             'INSERT INTO exchange_rates (rate, updated_at) VALUES ($1, NOW()) RETURNING id',
//             [cleanRate]
//         );

//         console.log(`[${timestamp}] ✅ ÉXITO: Tasa guardada (ID: ${dbResult.rows[0].id})`);
//         console.log(`[${timestamp}] 💵 Valor: ${cleanRate} Bs.\n`);

//         return cleanRate;

//     } catch (error) {
//         console.error(`[${timestamp}] 🚨 ERROR CRÍTICO en el Scraper:`);
//         if (error.response) {
//             // El servidor del BCV respondió con error (ej. 500 o 404)
//             console.error(`   Status: ${error.response.status}`);
//         } else if (error.request) {
//             // No hubo respuesta (BCV caído o sin internet)
//             console.error(`   Sin respuesta del servidor (Timeout/Conexión)`);
//         } else {
//             console.error(`   Mensaje: ${error.message}`);
//         }
//         return null;
//     }
// };