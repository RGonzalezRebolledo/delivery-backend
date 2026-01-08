import pg from 'pg';
// import { pgdb } from './config.js';
import 'dotenv/config';

// 1. Usamos DATABASE_URL si existe (Producción), si no, los valores de config.js (Local)
// const isProduction = process.env.DATABASE_URL;

// export const pool = new pg.Pool({
//     connectionString: isProduction 
//         ? process.env.DATABASE_URL 
//         : `postgresql://${pgdb.DB_USER}:${pgdb.DB_PASSWORD}@${pgdb.DB_HOST}:${pgdb.DB_PORT}/${pgdb.DB_DATABASE}`,
    
//     // 2. SSL es OBLIGATORIO para PostgreSQL en Railway
//     ssl: isProduction 
//         ? { rejectUnauthorized: false } 
//         : false
// });

// // Verificación para los logs
// pool.on('connect', () => {
//     console.log('✅ Conexión exitosa a PostgreSQL');
// });

// pool.on('error', (err) => {
//     console.error('❌ Error inesperado en el pool de conexión:', err);
// });





// import pg from 'pg';

// Prioridad absoluta a DATABASE_URL (la variable que Railway crea automáticamente)
const connectionString = "postgresql://postgres:zOediUhGgqpaaEypWgVWpxoDKAGadavw@yamanote.proxy.rlwy.net:47717/railway";;

console.log("--- DEBUG BASE DE DATOS ---");
console.log("DATABASE_URL existe:", !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
    console.log("Inicia con:", process.env.DATABASE_URL.substring(0, 15), "...");
}
console.log("---------------------------");

export const pool = new pg.Pool({
    connectionString: connectionString,
    // En Railway, la conexión interna/externa siempre requiere SSL
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('connect', () => {
    console.log(`✅ Conectado a la base de datos PostgreSQL en Railway`);
});

pool.on('error', (err) => {
    console.error('❌ Error inesperado en el pool de conexión:', err);
});

// import pg from 'pg';
// import { pgdb } from './config.js';

// // Construimos la URL manual para local o usamos la de producción
// const connectionString = process.env.DATABASE_URL || 
//     `postgresql://${pgdb.DB_USER}:${pgdb.DB_PASSWORD}@${pgdb.DB_HOST}:${pgdb.DB_PORT}/${pgdb.DB_DATABASE}`;

// export const pool = new pg.Pool({
//     connectionString: connectionString,
//     // Forzamos SSL si el host NO es localhost (asumiendo que es Railway)
//     ssl: pgdb.DB_HOST !== 'localhost' 
//         ? { rejectUnauthorized: false } 
//         : false
// });

// pool.on('connect', () => {
//     console.log(`✅ Conectado a la base de datos: ${pgdb.DB_DATABASE}`);
// });


// import pg from 'pg';
// import { pgdb } from './config.js';

// // Railway proporciona process.env.DATABASE_URL automáticamente
// // Si no existe (estás en local), usará los valores de tu config.js
// const connectionString = process.env.DATABASE_URL || `postgresql://${pgdb.DB_USER}:${pgdb.DB_PASSWORD}@${pgdb.DB_HOST}:${pgdb.DB_PORT}/${pgdb.DB_DATABASE}`;

// export const pool = new pg.Pool({
//     connectionString: connectionString,
//     // SSL es obligatorio para conexiones externas a Railway
//     ssl: process.env.DATABASE_URL 
//         ? { rejectUnauthorized: false } 
//         : false
// });

// // Opcional: Verificar conexión en la consola al iniciar
// pool.on('connect', () => {
//     console.log('✅ Conectado a la base de datos PostgreSQL');
// });

// pool.on('error', (err) => {
//     console.error('❌ Error inesperado en el pool de Postgres', err);
// });

// import pg from 'pg';
// import {pgdb} from './config.js'

// export const pool = new pg.Pool (
//     {
//        user: pgdb.DB_USER,
//        host: pgdb.DB_HOST,
//        database: pgdb.DB_DATABASE,
//        password: pgdb.DB_PASSWORD,
//        port: pgdb.DB_PORT,
//     }
// ) 

// Función para borrar todos los registros (deja tablas intactas)
// export const clearDatabase = async () => {
//     try {
//       const clearScript = `
//         -- Borrar registros en orden inverso a las dependencias (para evitar errores de FK)
//         TRUNCATE TABLE repartidores_pedidos RESTART IDENTITY CASCADE;
//         TRUNCATE TABLE pedido_detalles RESTART IDENTITY CASCADE;
//         TRUNCATE TABLE pedidos RESTART IDENTITY CASCADE;
//         TRUNCATE TABLE direcciones RESTART IDENTITY CASCADE;
//         TRUNCATE TABLE repartidores RESTART IDENTITY CASCADE;
//         TRUNCATE TABLE productos RESTART IDENTITY CASCADE;
//         TRUNCATE TABLE usuarios RESTART IDENTITY CASCADE;
//       `;
//       await pool.query(clearScript);
//       console.log('Todos los registros borrados de la base de datos.');
//     } catch (error) {
//       console.error('Error al borrar registros:', error);
//     }
//   };
//   // Mantén initializeDatabase si la usas para recrear datos después
//   export const initializeDatabase = async () => {
//     // Tu código anterior para crear tablas e insertar datos
    
//   };