import { Router } from "express";
import { verifyToken } from '../middlewares/verifyToken.js'; // 👈 Importar el middleware
import { createOrder } from "../../controllers/client/clientNewOrder.controller.js";

const routerClientNewOrder = Router();

routerClientNewOrder.post('/client/new-order',verifyToken, createOrder);

export default routerClientNewOrder;