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
    transports: ['polling', 'websocket'],
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    allowEIO3: true
});

// Guardar instancia para usar en controladores
app.set('socketio', io);

// io.on('connection', (socket) => {
//     console.log('📱 Dispositivo conectado:', socket.id);

//     socket.on('join_driver_room', (usuario_id) => {
//         if (usuario_id) {
//             // ✅ Cambiado a driver_ para coincidir con el servicio de asignación
//             socket.join(`driver_${usuario_id}`);
//             console.log(`👷 Repartidor ${usuario_id} unido a canal privado driver_${usuario_id}`);
//         }
//     });

//     socket.on('disconnect', (reason) => {
//         console.log('❌ Conexión cerrada:', reason);
//     });
// });

io.on('connection', (socket) => {
    console.log('📱 Dispositivo conectado:', socket.id);

    socket.on('join_driver_room', (usuario_id) => {
        if (usuario_id) {
            const room = `driver_${usuario_id}`;
            socket.join(room);
            console.log(`👷 Repartidor ${usuario_id} unido a canal: ${room}`);
            
            // Confirmación opcional para el frontend
            socket.emit('room_joined', room); 
        }
    });
});

// --- LÓGICA CRON BCV (Agregada) ---
cron.schedule('2 9,16 * * 1-5', async () => {
    console.log(`[${new Date().toLocaleString()}] Ejecutando actualización programada BCV...`);
    await runBcvScraper();
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
app.use(routerDriverManagement);

// --- MANEJO DE ERRORES GLOBAL (Agregado para evitar caídas del server) ---
app.use((err, req, res, next) => {
    console.error('🔥 Error detectado:', err.stack);
    res.status(err.status || 500).json({
        status: "error",
        message: err.message || "Error interno del servidor",
    });
});

// --- LEVANTAR SERVIDOR ---
const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log("--------------------------");
    console.log(`🚀 Gazzella Express en puerto ${PORT}`);
    
    // Inicialización BCV
    try {
        const res = await pool.query('SELECT COUNT(*) FROM exchange_rates');
        if (parseInt(res.rows[0].count) === 0) {
            console.log("ℹ️ Base de tasas vacía, scrapeando...");
            await runBcvScraper();
        } else {
            console.log("✅ Tasas de cambio verificadas.");
        }
    } catch (e) {
        console.error("Error inicializando tasa:", e.message);
    }
    console.log("--------------------------");
});


// import 'dotenv/config';
// import express from 'express';
// import { createServer } from 'http'; 
// import { Server } from 'socket.io'; 
// import morgan from 'morgan';
// import cors from 'cors';
// import cookieParser from 'cookie-parser';
// import cron from 'node-cron';
// import { pool } from './db.js';
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
// import routerDriverManagement from './routes/driver/driverManagement.route.js';

// const app = express();
// const httpServer = createServer(app);

// // --- CONFIGURACIÓN DE CORS ---
// const allowedOrigins = [
//     'http://localhost:5173',
//     'http://localhost:5174',
//     'https://deliveryaplication-ioll.vercel.app'
// ];

// app.use(cors({
//     origin: function (origin, callback) {
//         if (!origin || allowedOrigins.includes(origin)) {
//             callback(null, true);
//         } else {
//             callback(new Error('Bloqueado por CORS'));
//         }
//     },
//     credentials: true,
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
// }));

// // --- CONFIGURACIÓN DE SOCKET.IO ---
// const io = new Server(httpServer, {
//     cors: {
//         origin: allowedOrigins,
//         methods: ["GET", "POST"],
//         credentials: true
//     },
//     transports: ['polling', 'websocket'], // Prioriza polling para evitar errores de conexión inicial
//     pingTimeout: 60000, // Aumentamos el tiempo de espera
//     pingInterval: 25000,
//     connectTimeout: 45000,
//     allowEIO3: true
// });

// app.set('socketio', io);

// io.on('connection', (socket) => {
//     console.log('📱 Dispositivo conectado:', socket.id);

//     socket.on('join_driver_room', (usuario_id) => {
//         if (usuario_id) {
//             socket.join(`user_${usuario_id}`);
//             console.log(`👷 Repartidor ${usuario_id} unido a canal privado`);
//         }
//     });

//     socket.on('disconnect', (reason) => {
//         console.log('❌ Conexión cerrada:', reason);
//     });
// });

// // --- MIDDLEWARES ---
// app.use(morgan('dev'));
// app.use(express.json());
// app.use(express.urlencoded({ extended: false }));
// app.use(cookieParser());

// // --- MONTAJE DE RUTAS ---
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
// app.use(routerDriverGetDrivers);
// app.use(routerDriverRegisterModal);
// app.use(routerDriverManagement); // Aquí están tus nuevos endpoints de disponibilidad

// // --- LEVANTAR SERVIDOR ---
// const PORT = process.env.PORT || 4000;

// httpServer.listen(PORT, '0.0.0.0', async () => {
//     console.log("--------------------------");
//     console.log(`🚀 Gazzella Express en puerto ${PORT}`);
    
//     // Inicialización BCV
//     try {
//         const res = await pool.query('SELECT COUNT(*) FROM exchange_rates');
//         if (parseInt(res.rows[0].count) === 0) {
//             await runBcvScraper();
//         }
//     } catch (e) {
//         console.error("Error inicializando tasa:", e.message);
//     }
//     console.log("--------------------------");
// });



