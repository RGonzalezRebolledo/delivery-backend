import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';
import pool from './db.js';
import { runBcvScraper } from './services/scraperService.js';

// --- IMPORTACIÓN DE RUTAS ---
import routerUsers from './routes/users.route.js';
import routerLogin from './routes/login.route.js';
import routerAuth from './routes/auth.route.js';
import routerClientOrders from './routes/client/clientdashboard.route.js';
import routerCheckSesion from './routes/checkSesion.route.js';
import routerClientNewOrder from './routes/client/clientNewOrder.route.js';
import routerExchangeRate from './routes/apis/exchangeRate.route.js';
import routerCalculateDeliveryCost from './routes/calculateCost.route.js';
import routerClientAddresses from './routes/client/clientaddresses.route.js';
import routerLoginAdmin from './routes/administrator/loginAdmin.route.js';
import routerVehicles from './routes/administrator/typeVhicle.route.js';
import routerServices from './routes/administrator/typeServices.route.js';

const app = express();

// --- LÓGICA DE TASA DE CAMBIO (BCV) ---

// 1. Inicialización (Se ejecuta una vez al levantar el server)
const initializeExchangeRate = async () => {
    try {
        const res = await pool.query('SELECT COUNT(*) FROM exchange_rates');
        const count = parseInt(res.rows[0].count);

        if (count === 0) {
            console.log("ℹ️ Base de datos de tasas vacía. Inicializando con valor actual del BCV...");
            await runBcvScraper();
        } else {
            console.log(`✅ Base de datos de tasas lista (Registros: ${count})`);
        }
    } catch (error) {
        console.error("❌ Error al inicializar la tasa:", error.message);
    }
};

// 2. Tarea con reintentos para el Cron
const taskWithRetry = async (attempt = 1) => {
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY = 10 * 60 * 1000;

    console.log(`\n[${new Date().toLocaleString()}] Intentando actualización BCV (Intento ${attempt}/${MAX_ATTEMPTS})...`);
    const result = await runBcvScraper();

    if (result) {
        console.log(`✅ Proceso completado exitosamente.`);
    } else if (attempt < MAX_ATTEMPTS) {
        console.log(`⚠️ Falló intento ${attempt}. Reintentando en 10 min...`);
        setTimeout(() => taskWithRetry(attempt + 1), RETRY_DELAY);
    } else {
        console.error(`🚨 Se alcanzaron los ${MAX_ATTEMPTS} intentos. Fallo definitivo.`);
    }
};

// 3. Programación Cron (9:02 AM y 4:02 PM)
cron.schedule('2 9,16 * * 1-5', () => {
    taskWithRetry();
});

// --- CONFIGURACIÓN DE CORS ---
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://deliveryaplication-ioll.vercel.app'
];

if (process.env.FRONTEND_URL_DEV) {
    process.env.FRONTEND_URL_DEV.split(',').forEach(o => allowedOrigins.push(o.trim()));
}
if (process.env.FRONTEND_URL_PROD) {
    allowedOrigins.push(process.env.FRONTEND_URL_PROD.trim());
}

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`⚠️ Origen bloqueado por CORS: ${origin}`);
            callback(null, false); 
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// --- MIDDLEWARES ---
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// --- RUTAS ---
app.use(routerCheckSesion);
app.use(routerUsers);
app.use(routerLogin);
app.use(routerAuth);
app.use(routerClientOrders);
app.use(routerClientNewOrder);
app.use(routerExchangeRate);
app.use(routerCalculateDeliveryCost);
app.use(routerClientAddresses);
app.use(routerLoginAdmin);
app.use(routerVehicles);
app.use(routerServices);

// --- MANEJO DE ERRORES GLOBAL ---
app.use((err, req, res, next) => {
    console.error('🔥 Error detectado:', err.stack);
    res.status(err.status || 500).json({
        status: "error",
        message: err.message || "Error interno del servidor",
    });
});

// --- LEVANTAR SERVIDOR ---
const PORT = process.env.PORT || 4000;

app.listen(PORT, '0.0.0.0', async () => {
    console.log("--------------------------");
    console.log(`🚀 Servidor en puerto ${PORT}`);
    
    // Ejecutamos la inicialización de la tasa al arrancar
    await initializeExchangeRate();
    
    console.log("--------------------------");
});

// import 'dotenv/config';
// import express from 'express';
// import morgan from 'morgan';
// import cors from 'cors';
// import cookieParser from 'cookie-parser';
// import cron from 'node-cron';
// import { runBcvScraper } from './services/scraperService.js';
// import pool from './db.js';

// // Importación de Rutas
// import routerUsers from './routes/users.route.js';
// import routerLogin from './routes/login.route.js';
// import routerAuth from './routes/auth.route.js';
// import routerClientOrders from './routes/client/clientdashboard.route.js';
// import routerCheckSesion from './routes/checkSesion.route.js';
// import routerClientNewOrder from './routes/client/clientNewOrder.route.js';
// import routerExchangeRate from './routes/apis/exchangeRate.route.js';
// import routerCalculateDeliveryCost from './routes/calculateCost.route.js';
// import routerClientAddresses from './routes/client/clientaddresses.route.js';
// import routerLoginAdmin from './routes/administrator/loginAdmin.route.js';
// import routerVehicles from './routes/administrator/typeVhicle.route.js';
// import routerServices from './routes/administrator/typeServices.route.js';

// /**
//  * Función que intenta ejecutar el scraper.
//  * Si falla, espera 10 minutos y vuelve a intentar (máximo 3 intentos).
//  * en esta funcion activo el cambio del dolar del dia segun la hora
//  */
// import { runBcvScraper } from './services/scraperService.js';
// import pool from './db.js';

// // ... (tus otras importaciones)

// const initializeExchangeRate = async () => {
//     try {
//         // Verificamos si ya existe al menos un registro
//         const res = await pool.query('SELECT COUNT(*) FROM exchange_rates');
//         const count = parseInt(res.rows[0].count);

//         if (count === 0) {
//             console.log("ℹ️ Base de datos de tasas vacía. Inicializando con valor actual del BCV...");
//             await runBcvScraper();
//         } else {
//             console.log(`✅ Base de datos de tasas lista (Registros: ${count})`);
//         }
//     } catch (error) {
//         console.error("❌ Error al inicializar la tasa:", error.message);
//     }
// };

// // Llamamos a la función justo después de conectar la base de datos o al iniciar el server
// initializeExchangeRate();

// const fetchCurrentExchangeRateFromDB = async () => {
//     try {
//         const result = await pool.query(
//             'SELECT rate FROM exchange_rates ORDER BY updated_at DESC LIMIT 1'
//         );

//         if (result.rows.length > 0) {
//             return parseFloat(result.rows[0].rate);
//         }
        
//         // --- FALLBACK DE EMERGENCIA ---
//         // Si no hay nada en DB y el scraper inicial falló, devolvemos un valor 
//         // aproximado para que el sistema no dé 0.
//         console.warn("⚠️ DB vacía. Usando fallback de emergencia.");
//         return 36.50; // Coloca aquí un valor base realista
        
//     } catch (error) {
//         console.error("⚠️ Error en DB:", error.message);
//         return 36.50; 
//     }
// };

// const taskWithRetry = async (attempt = 1) => {
//     const MAX_ATTEMPTS = 3;
//     const RETRY_DELAY = 10 * 60 * 1000; // 10 minutos en milisegundos

//     console.log(`\n[${new Date().toLocaleString()}] Intentando actualización (Intento ${attempt}/${MAX_ATTEMPTS})...`);
    
//     const result = await runBcvScraper();

//     if (result) {
//         console.log(`✅ Proceso completado exitosamente en el intento ${attempt}.`);
//     } else if (attempt < MAX_ATTEMPTS) {
//         console.log(`⚠️ Falló el intento ${attempt}. Reintentando en 10 minutos...`);
        
//         setTimeout(() => {
//             taskWithRetry(attempt + 1);
//         }, RETRY_DELAY);
//     } else {
//         console.error(`🚨 Se alcanzaron los ${MAX_ATTEMPTS} intentos. La actualización falló definitivamente.`);
//         // Aquí podrías enviar un correo o notificación de error si lo deseas
//     }
// };

// // Programación: Lunes a Viernes a las 9am y 4pm
// cron.schedule('2 9,16 * * 1-5', () => {
//     taskWithRetry();
// });


// const app = express();

// // --- CONFIGURACIÓN DE CORS ---
// const allowedOrigins = [
//     'http://localhost:5173',
//     'http://localhost:5174',
//     'https://deliveryaplication-ioll.vercel.app'
// ];

// // Carga dinámica de orígenes desde variables de entorno
// if (process.env.FRONTEND_URL_DEV) {
//     process.env.FRONTEND_URL_DEV.split(',').forEach(o => allowedOrigins.push(o.trim()));
// }
// if (process.env.FRONTEND_URL_PROD) {
//     allowedOrigins.push(process.env.FRONTEND_URL_PROD.trim());
// }

// app.use(cors({
//     origin: function (origin, callback) {
//         // !origin permite herramientas como Postman o Thunder Client
//         if (!origin || allowedOrigins.includes(origin)) {
//             callback(null, true);
//         } else {
//             // No bloqueamos con error de servidor para evitar el 502, 
//             // simplemente denegamos el acceso CORS
//             console.warn(`⚠️ Origen bloqueado por CORS: ${origin}`);
//             callback(null, false); 
//         }
//     },
//     credentials: true,
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
// }));

// // --- MIDDLEWARES ---
// app.use(morgan('dev'));
// app.use(express.json());
// app.use(express.urlencoded({ extended: false }));
// app.use(cookieParser());

// // --- RUTAS ---
// // Es buena práctica agruparlas o usar un prefijo como /api si lo deseas
// app.use(routerCheckSesion);
// app.use(routerUsers);
// app.use(routerLogin);
// app.use(routerAuth);
// app.use(routerClientOrders);
// app.use(routerClientNewOrder);
// app.use(routerExchangeRate);
// app.use(routerCalculateDeliveryCost);
// app.use(routerClientAddresses);
// app.use(routerLoginAdmin);
// app.use(routerVehicles);
// app.use(routerServices);

// // --- MANEJO DE ERRORES GLOBAL ---
// // Esto evita que el servidor se caiga (502) ante un error no controlado
// app.use((err, req, res, next) => {
//     console.error('🔥 Error detectado:', err.stack);
//     res.status(err.status || 500).json({
//         status: "error",
//         message: err.message || "Error interno del servidor",
//     });
// });

// // --- LEVANTAR SERVIDOR ---
// const PORT = process.env.PORT || 4000;

// // Escuchar en 0.0.0.0 es obligatorio para Railway
// // app.listen(PORT, '0.0.0.0', () => {
// //     console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
// //     console.log('✅ Orígenes permitidos:', allowedOrigins);
// // });

// app.listen(PORT, '0.0.0.0', () => {
//     console.log("--- CHECK DE VARIABLES ---");
//     console.log("DATABASE_URL existe:", !!process.env.DATABASE_URL);
//     if (process.env.DATABASE_URL) {
//         console.log("Host detectado:", process.env.DATABASE_URL.split('@')[1]?.split(':')[0]);
//     }
//     console.log("--------------------------");
//     console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
// });




