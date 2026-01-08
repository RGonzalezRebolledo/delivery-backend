import 'dotenv/config'
import express from 'express'
import { pgdb } from './config.js'
import morgan from 'morgan'
import cors from 'cors' // <--- Única declaración necesaria
import routerUsers from './routes/users.route.js'
import routerLogin from './routes/login.route.js'
import routerAuth from './routes/auth.route.js'
import routerClientOrders from './routes/client/clientdashboard.route.js'
import routerCheckSesion from './routes/checkSesion.route.js'
import routerClientNewOrder from './routes/client/clientNewOrder.route.js'
import routerExchangeRate from './routes/apis/exchangeRate.route.js' 
import routerCalculateDeliveryCost from './routes/delivery.route.js'
import cookieParser from 'cookie-parser';
import routerClientAddresses from './routes/client/clientaddresses.route.js'
import routerLoginAdmin from './routes/administrator/loginAdmin.route.js'
import routerVehicles from './routes/administrator/typeVhicle.route.js'
import routerServices from './routes/administrator/typeServices.route.js'

const app = express();

// --- CONFIGURACIÓN DE CORS ---
const allowedOrigins = [
  'http://localhost:5173', 
  'http://localhost:5174',
  'https://tu-frontend-en-railway.up.railway.app' // <--- Cambia esto por tu URL real de Railway cuando la tengas
];

// Si tienes variables en el .env, las sumamos
if (process.env.FRONTEND_URL_DEV) {
    process.env.FRONTEND_URL_DEV.split(',').forEach(o => allowedOrigins.push(o.trim()));
}
if (process.env.FRONTEND_URL_PROD) {
    allowedOrigins.push(process.env.FRONTEND_URL_PROD.trim());
}

app.use(cors({
  origin: function (origin, callback) {
    // Permitir solicitudes sin origen (como Postman o apps móviles) o si está en la lista
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true, // Vital para las cookies y sesiones
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// --- MIDDLEWARES ---
app.use(morgan('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser());

// --- RUTAS ---
app.use(routerCheckSesion)
app.use(routerUsers)
app.use(routerLogin)
app.use(routerAuth)
app.use(routerClientOrders)
app.use(routerClientNewOrder)
app.use(routerExchangeRate) 
app.use(routerCalculateDeliveryCost)  
app.use(routerClientAddresses)
app.use(routerLoginAdmin)
app.use(routerVehicles)
app.use(routerServices)

// Manejo de errores global
app.use((err, req, res, next) => {
    console.error(err.stack);
    return res.status(500).json({
        status: "error",
        message: err.message,
    });
});

// --- LEVANTAR SERVIDOR ---
const PORT = process.env.PORT || 4000;

// IMPORTANTE: En Railway es recomendable usar '0.0.0.0'
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log('Orígenes permitidos:', allowedOrigins);
});


// import 'dotenv/config'
// import express from 'express'
// import { pgdb } from './config.js'
// import morgan from 'morgan'
// import cors from 'cors'
// import routerUsers from './routes/users.route.js'
// import routerLogin from './routes/login.route.js'
// import routerAuth from './routes/auth.route.js'
// import routerClientOrders from './routes/client/clientdashboard.route.js'
// import routerCheckSesion from './routes/checkSesion.route.js'
// import routerClientNewOrder from './routes/client/clientNewOrder.route.js'
// import routerExchangeRate from './routes/apis/exchangeRate.route.js' 
// import routerCalculateDeliveryCost from './routes/delivery.route.js'
// // import { clearDatabase } from './db.js';
// import cookieParser from 'cookie-parser';
// import routerClientAddresses from './routes/client/clientaddresses.route.js'
// import routerLoginAdmin from './routes/administrator/loginAdmin.route.js'
// import routerVehicles from './routes/administrator/typeVhicle.route.js'
// import routerServices from './routes/administrator/typeServices.route.js'

// const app = express();

// // --- CONFIGURACIÓN DE CORS ---
// // Dividimos el string del .env por comas y limpiamos espacios en blanco
// const allowedOrigins = process.env.FRONTEND_URL_DEV 
//     ? process.env.FRONTEND_URL_DEV.split(',').map(origin => origin.trim()) 
//     : [];

// // Si tienes una URL de producción, la añadimos al array
// if (process.env.FRONTEND_URL_PROD) {
//     allowedOrigins.push(process.env.FRONTEND_URL_PROD.trim());
// }

// // app.use(cors({
// //     origin: (origin, callback) => {
// //         // Permitir solicitudes sin origen (como Postman) o si el origen está en la lista
// //         if (!origin || allowedOrigins.includes(origin)) {
// //             callback(null, true);
// //         } else {
// //             console.error(`CORS Error: El origen ${origin} no está permitido`);
// //             callback(new Error('Not allowed by CORS'));
// //         }
// //     },
// //     credentials: true,
// //     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
// // }));
// // -----------------------------
// const cors = require('cors');

// // ... después de inicializar app = express()

// app.use(cors({
//   origin: function (origin, callback) {
//     // Permite cualquier origen en desarrollo o especifica tus URLs
//     const allowedOrigins = [
//       'http://localhost:5173', // Puerto común de Vite
//       'http://localhost:5174', // El puerto que estás usando según tu error
//       'https://tu-frontend-en-railway.up.railway.app' 
//     ];
    
//     if (!origin || allowedOrigins.indexOf(origin) !== -1) {
//       callback(null, true);
//     } else {
//       callback(new Error('No permitido por CORS'));
//     }
//   },
//   credentials: true, // ¡ESTO ES VITAL porque usas withCredentials en el front!
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// }));

// app.use(morgan('dev'))
// app.use(express.json())
// app.use(express.urlencoded({ extended: false }))
// app.use(cookieParser());

// // Rutas
// app.use(routerCheckSesion)
// app.use(routerUsers)
// app.use(routerLogin)
// app.use(routerAuth)
// app.use(routerClientOrders)
// app.use(routerClientNewOrder)
// app.use(routerExchangeRate) 
// app.use(routerCalculateDeliveryCost)  
// app.use(routerClientAddresses)
// app.use (routerLoginAdmin)
// app.use (routerVehicles)
// app.use (routerServices)

// // Endpoint de mantenimiento
// // app.delete('/clear-db', async (req, res) => {
// //     try {
// //         await clearDatabase();
// //         res.json({ message: 'Base de datos limpiada' });
// //     } catch (error) {
// //         res.status(500).json({ error: error.message });
// //     }
// // });

// // Manejo de errores global
// app.use((err, req, res, next) => {
//     return res.status(500).json({
//         status: "error",
//         message: err.message,
//     });
// });

// // app.listen(pgdb.PORT, () => {
// //     console.log('Conectado en el puerto', pgdb.PORT);
// //     console.log('Orígenes permitidos:', allowedOrigins);
// // });
// // Usa el puerto que asigne Railway (process.env.PORT) o 4000 por defecto
// const PORT = process.env.PORT || 4000;

// app.listen(PORT, () => {
//     console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
//     console.log('Orígenes permitidos:', allowedOrigins);
// });
