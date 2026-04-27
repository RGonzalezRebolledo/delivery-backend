import { Router } from "express";
import { verifyToken } from '../middlewares/verifyToken.js'; // 👈 Importar el middleware
import { getDriverByOrder } from "../../controllers/client/getDriverByOrder.controller.js"; 

const routerGetDriverByOrder = Router();

routerGetDriverByOrder.get('/client/order-driver/:pedidoId',verifyToken, getDriverByOrder);

export default routerGetDriverByOrder;