import { Router } from "express";
import { verifyToken } from '../middlewares/verifyToken.js'; // 👈 Importar el middleware
import { registerDriverInterview } from "../../controllers/drivers/driverRegisterModal.controller.js";

const routerDriverGetDrivers = Router();

routerDriverGetDrivers.get('/driver/getdrivers',verifyToken, registerDriverInterview);

export default routerDriverGetDrivers;