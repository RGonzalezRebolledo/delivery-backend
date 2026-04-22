import { Router } from 'express';
import { 
    toggleAvailability, 
    getCurrentOrder, 
    completeOrder 
} from '../../controllers/drivers/managementDriver.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js'; // Tu middleware de JWT

const routerDriverManagement = Router();

// Todas las rutas de conductor requieren estar logueado
routerDriverManagement.use(verifyToken);

// Ruta para el Switch de disponibilidad
routerDriverManagement.patch('/driver/availability', toggleAvailability);

// Ruta para que el dashboard sepa si hay un pedido al cargar
routerDriverManagement.get('/driver/current-order', getCurrentOrder);

// Ruta para finalizar la entrega
routerDriverManagement.post('/driver/complete-order', completeOrder);

export default routerDriverManagement;