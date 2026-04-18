import pg from 'pg';
import 'dotenv/config';

// Prioridad absoluta a DATABASE_URL
const connectionString = "postgresql://postgres:zOediUhGgqpaaEypWgVWpxoDKAGadavw@yamanote.proxy.rlwy.net:47717/railway";

console.log("--- DEBUG BASE DE DATOS ---");
console.log("DATABASE_URL existe:", !!connectionString);
if (connectionString) {
    console.log("Inicia con:", connectionString.substring(0, 15), "...");
}
console.log("---------------------------");

export const pool = new pg.Pool({
    connectionString: connectionString,
    // SSL es obligatorio para Railway
    ssl: {
        rejectUnauthorized: false
    },
    // FUERZA LA ZONA HORARIA DESDE LA CONFIGURACIÓN DEL CLIENTE
    // Esto asegura que cada sesión inicie en hora de Venezuela (UTC-4)
    options: "-c timezone=America/Caracas"
});

// Verificación y configuración adicional por seguridad
pool.on('connect', async (client) => {
    try {
        // Doble verificación: asegura que la conexión actual use la zona horaria correcta
        await client.query("SET timezone = 'America/Caracas'");
        console.log(`✅ Conexión establecida: Hora de Venezuela (America/Caracas)`);
    } catch (err) {
        console.error('❌ Error al sincronizar zona horaria en la conexión:', err);
    }
});

pool.on('error', (err) => {
    console.error('❌ Error inesperado en el pool de conexión:', err);
});



// import pg from 'pg';
// // import { pgdb } from './config.js';
// import 'dotenv/config';

// // 1. Usamos DATABASE_URL si existe (Producción), si no, los valores de config.js (Local)
// // const isProduction = process.env.DATABASE_URL;

// // export const pool = new pg.Pool({
// //     connectionString: isProduction 
// //         ? process.env.DATABASE_URL 
// //         : `postgresql://${pgdb.DB_USER}:${pgdb.DB_PASSWORD}@${pgdb.DB_HOST}:${pgdb.DB_PORT}/${pgdb.DB_DATABASE}`,
    
// //     // 2. SSL es OBLIGATORIO para PostgreSQL en Railway
// //     ssl: isProduction 
// //         ? { rejectUnauthorized: false } 
// //         : false
// // });

// // // Verificación para los logs
// // pool.on('connect', () => {
// //     console.log('✅ Conexión exitosa a PostgreSQL');
// // });

// // pool.on('error', (err) => {
// //     console.error('❌ Error inesperado en el pool de conexión:', err);
// // });


// // import pg from 'pg';

// // Prioridad absoluta a DATABASE_URL (la variable que Railway crea automáticamente)
// const connectionString = "postgresql://postgres:zOediUhGgqpaaEypWgVWpxoDKAGadavw@yamanote.proxy.rlwy.net:47717/railway";;

// console.log("--- DEBUG BASE DE DATOS ---");
// console.log("DATABASE_URL existe:", connectionString);
// if (connectionString) {
//     console.log("Inicia con:", connectionString.substring(0, 15), "...");
// }
// console.log("---------------------------");

// export const pool = new pg.Pool({
//     connectionString: connectionString,
//     // En Railway, la conexión interna/externa siempre requiere SSL
//     ssl: {
//         rejectUnauthorized: false
//     }
// });

// // CONFIGURACIÓN GLOBAL DE ZONA HORARIA
// pool.on('connect', async (client) => {
//     try {
//         // Establece la zona horaria de Venezuela para cada nueva conexión
//         await client.query("SET timezone = 'America/Caracas'");
//         console.log(`✅ Conectado a PostgreSQL (Zona Horaria: America/Caracas)`);
//     } catch (err) {
//         console.error('❌ Error al establecer timezone:', err);
//     }
// });

// pool.on('connect', () => {
//     console.log(`✅ Conectado a la base de datos PostgreSQL en Railway`);
// });

// pool.on('error', (err) => {
//     console.error('❌ Error inesperado en el pool de conexión:', err);
// });






/