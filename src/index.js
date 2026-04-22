import 'dotenv/config';
import express from 'express';
import { createServer } from 'http'; 
import { Server } from 'socket.io'; 
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';
import { pool } from './db.js';
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
import routerDriverGetDrivers from './routes/driver/driver.route.js';
import routerDriverRegisterModal from './routes/driver/driverRegisterModal.route.js';
import routerDriverManagement from './routes/driver/driverManagement.route.js';

const app = express();
const httpServer = createServer(app);

// --- CONFIGURACIÓN DE CORS ---
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://deliveryaplication-ioll.vercel.app'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Bloqueado por CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// --- CONFIGURACIÓN DE SOCKET.IO ---
const io = new Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['polling', 'websocket'], // Prioriza polling para evitar errores de conexión inicial
    pingTimeout: 60000, // Aumentamos el tiempo de espera
    pingInterval: 25000,
    connectTimeout: 45000,
    allowEIO3: true
});

app.set('socketio', io);

io.on('connection', (socket) => {
    console.log('📱 Dispositivo conectado:', socket.id);

    socket.on('join_driver_room', (usuario_id) => {
        if (usuario_id) {
            socket.join(`user_${usuario_id}`);
            console.log(`👷 Repartidor ${usuario_id} unido a canal privado`);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('❌ Conexión cerrada:', reason);
    });
});

// --- MIDDLEWARES ---
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// --- MONTAJE DE RUTAS ---
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
app.use(routerDriverGetDrivers);
app.use(routerDriverRegisterModal);
app.use(routerDriverManagement); // Aquí están tus nuevos endpoints de disponibilidad

// --- LEVANTAR SERVIDOR ---
const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log("--------------------------");
    console.log(`🚀 Gazzella Express en puerto ${PORT}`);
    
    // Inicialización BCV
    try {
        const res = await pool.query('SELECT COUNT(*) FROM exchange_rates');
        if (parseInt(res.rows[0].count) === 0) {
            await runBcvScraper();
        }
    } catch (e) {
        console.error("Error inicializando tasa:", e.message);
    }
    console.log("--------------------------");
});



// import 'dotenv/config';
// import express from 'express';
// import morgan from 'morgan';
// import cors from 'cors';
// import cookieParser from 'cookie-parser';
// import cron from 'node-cron';
// import {pool} from './db.js';
// import { runBcvScraper } from './services/scraperService.js';

// // --- IMPORTACIÓN DE RUTAS ---
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
// import routerDriverGetDrivers from './routes/driver/driver.route.js';
// import routerDriverRegisterModal from './routes/driver/driverRegisterModal.route.js';

// const app = express();

// // --- LÓGICA DE TASA DE CAMBIO (BCV) ---

// // 1. Inicialización (Se ejecuta una vez al levantar el server)
// const initializeExchangeRate = async () => {
//     try {
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

// // 2. Tarea con reintentos para el Cron
// const taskWithRetry = async (attempt = 1) => {
//     const MAX_ATTEMPTS = 3;
//     const RETRY_DELAY = 10 * 60 * 1000;

//     console.log(`\n[${new Date().toLocaleString()}] Intentando actualización BCV (Intento ${attempt}/${MAX_ATTEMPTS})...`);
//     const result = await runBcvScraper();

//     if (result) {
//         console.log(`✅ Proceso completado exitosamente.`);
//     } else if (attempt < MAX_ATTEMPTS) {
//         console.log(`⚠️ Falló intento ${attempt}. Reintentando en 10 min...`);
//         setTimeout(() => taskWithRetry(attempt + 1), RETRY_DELAY);
//     } else {
//         console.error(`🚨 Se alcanzaron los ${MAX_ATTEMPTS} intentos. Fallo definitivo.`);
//     }
// };

// // 3. Programación Cron (9:02 AM y 4:02 PM)
// cron.schedule('2 9,16 * * 1-5', () => {
//     taskWithRetry();
// });

// // --- CONFIGURACIÓN DE CORS ---
// const allowedOrigins = [
//     'http://localhost:5173',
//     'http://localhost:5174',
//     'https://deliveryaplication-ioll.vercel.app'
// ];

// if (process.env.FRONTEND_URL_DEV) {
//     process.env.FRONTEND_URL_DEV.split(',').forEach(o => allowedOrigins.push(o.trim()));
// }
// if (process.env.FRONTEND_URL_PROD) {
//     allowedOrigins.push(process.env.FRONTEND_URL_PROD.trim());
// }

// app.use(cors({
//     origin: function (origin, callback) {
//         if (!origin || allowedOrigins.includes(origin)) {
//             callback(null, true);
//         } else {
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
// app.use(routerDriverGetDrivers)
// app.use(routerDriverRegisterModal)

// // --- MANEJO DE ERRORES GLOBAL ---
// app.use((err, req, res, next) => {
//     console.error('🔥 Error detectado:', err.stack);
//     res.status(err.status || 500).json({
//         status: "error",
//         message: err.message || "Error interno del servidor",
//     });
// });

// // --- LEVANTAR SERVIDOR ---
// const PORT = process.env.PORT || 4000;

// app.listen(PORT, '0.0.0.0', async () => {
//     console.log("--------------------------");
//     console.log(`🚀 Servidor en puerto ${PORT}`);
    
//     // USAR AWAIT AQUÍ ES VITAL
//     await initializeExchangeRate(); 
    
//     console.log("--------------------------");
// });




