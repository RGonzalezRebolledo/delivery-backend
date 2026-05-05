import { Router } from "express";
import {
  toggleAvailability,
  getCurrentOrder,
  completeOrder,
  updateOrderStatus,
  getDriverRatingAverage,
  rateClient,
  getClientInfoForRating
} from "../../controllers/drivers/managementDriver.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js"; // 👈 Importar el middleware

const routerDriverManagement = Router();

// Todas las rutas de conductor requieren estar logueado
routerDriverManagement.use(verifyToken);

// Ruta para el Switch de disponibilidad
routerDriverManagement.patch("/driver/availability", toggleAvailability);

// Ruta para que el dashboard sepa si hay un pedido al cargar
routerDriverManagement.get("/driver/current-order", getCurrentOrder);

// Ruta para finalizar la entrega
routerDriverManagement.post("/driver/complete-order", completeOrder);
routerDriverManagement.patch("/driver/order-status", updateOrderStatus);
routerDriverManagement.get('/driver/rating/:driverId', getDriverRatingAverage);
routerDriverManagement.post('/driver/rate-client',rateClient);
routerDriverManagement.get('/driver/client-info/:pedido_id', getClientInfoForRating);

export default routerDriverManagement;
