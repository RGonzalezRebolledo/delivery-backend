import 'dotenv/config'
import express from 'express'
import { pgdb } from './config.js'
import morgan from 'morgan'
import cors from 'cors'
import routerUsers from './routes/users.route.js'
import routerLogin from './routes/login.route.js'
import routerAuth from './routes/auth.route.js'
import routerClientOrders from './routes/client/clientdashboard.route.js'
import routerCheckSesion from './routes/checkSesion.route.js'
import routerClientNewOrder from './routes/client/clientNewOrder.route.js'
import routerExchangeRate from './routes/apis/exchangeRate.route.js' 
import routerCalculateDeliveryCost from './routes/delivery.route.js'
// import { clearDatabase } from './db.js';
import cookieParser from 'cookie-parser';
import routerClientAddresses from './routes/client/clientaddresses.route.js'
import routerLoginAdmin from './routes/administrator/loginAdmin.route.js'
import routerVehicles from './routes/administrator/typeVhicle.route.js'
import routerServices from './routes/administrator/typeServices.route.js'

const app = express();

// --- CONFIGURACIÓN DE CORS ---
// Dividimos el string del .env por comas y limpiamos espacios en blanco
const allowedOrigins = process.env.FRONTEND_URL_DEV 
    ? process.env.FRONTEND_URL_DEV.split(',').map(origin => origin.trim()) 
    : [];

// Si tienes una URL de producción, la añadimos al array
if (process.env.FRONTEND_URL_PROD) {
    allowedOrigins.push(process.env.FRONTEND_URL_PROD.trim());
}

app.use(cors({
    origin: (origin, callback) => {
        // Permitir solicitudes sin origen (como Postman) o si el origen está en la lista
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.error(`CORS Error: El origen ${origin} no está permitido`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
// -----------------------------

app.use(morgan('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser());

// Rutas
app.use(routerCheckSesion)
app.use(routerUsers)
app.use(routerLogin)
app.use(routerAuth)
app.use(routerClientOrders)
app.use(routerClientNewOrder)
app.use(routerExchangeRate) 
app.use(routerCalculateDeliveryCost)  
app.use(routerClientAddresses)
app.use (routerLoginAdmin)
app.use (routerVehicles)
app.use (routerServices)

// Endpoint de mantenimiento
// app.delete('/clear-db', async (req, res) => {
//     try {
//         await clearDatabase();
//         res.json({ message: 'Base de datos limpiada' });
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });

// Manejo de errores global
app.use((err, req, res, next) => {
    return res.status(500).json({
        status: "error",
        message: err.message,
    });
});

// app.listen(pgdb.PORT, () => {
//     console.log('Conectado en el puerto', pgdb.PORT);
//     console.log('Orígenes permitidos:', allowedOrigins);
// });
// Usa el puerto que asigne Railway (process.env.PORT) o 4000 por defecto
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log('Orígenes permitidos:', allowedOrigins);
});
