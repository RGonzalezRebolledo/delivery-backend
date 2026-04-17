import { Router } from "express";
import { verifyToken } from '../middlewares/verifyToken.js'; // 👈 Importar el middleware
import { getDrivers } from "../../controllers/drivers/drivers.controller.js";

const routerDriverGetDrivers = Router();

routerDriverGetDrivers.get('/driver/getdrivers',verifyToken, getDrivers);

export default routerDriverGetDrivers;