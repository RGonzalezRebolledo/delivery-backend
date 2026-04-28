
import { Router } from "express";


// Importamos los controladores (asumiendo el archivo anterior)
import { getAdminClients, 
    getAdminActiveOrders, 
    getAdminDriversStatus
 } from '../../../controllers/administrator/managment/adminManagment.js';
// Middleware de autenticación (ejemplo de lo que deberías tener)
// import { verifyToken, isAdmin } from '../middleware/authMiddleware.js';
import { verifyToken } from "../../middlewares/verifyToken.js";
const routerAdminManagment = Router();
// --- RUTAS DEL MÓDULO ADMINISTRATIVO ---

// 1. Obtener todos los usuarios tipo 'cliente'
// GET /api/admin/clients
routerAdminManagment.get('/admin/clients', verifyToken, getAdminClients);

// 2. Obtener pedidos que no han finalizado
// GET /api/admin/active-orders
routerAdminManagment.get('/admin/active-orders', verifyToken, getAdminActiveOrders);

// 3. Monitor de repartidores (disponibilidad y pedidos actuales)
// GET /api/admin/drivers-status
routerAdminManagment.get('/admin/drivers-status', verifyToken, getAdminDriversStatus);

export default routerAdminManagment;
