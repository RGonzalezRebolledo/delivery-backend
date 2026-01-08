import { Router } from "express";
import { getClientOrders } from "../../controllers/client/clientdashboard.controller.js";
import { verifyToken } from '../middlewares/verifyToken.js'; // 👈 Importar el middleware

const routerClientOrders = Router();

routerClientOrders.get('/client/orders',verifyToken, getClientOrders);

export default routerClientOrders;