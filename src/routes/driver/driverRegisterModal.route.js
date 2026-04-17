import { Router } from "express";
import { verifyToken } from '../middlewares/verifyToken.js'; // 👈 Importar el middleware
import { driverRegister } from "../../controllers/drivers/driverRegisterModal.controller.js";

const routerDriverRegisterModal = Router();

routerDriverGetDrivers.get('/driver/driver-register-modal',verifyToken, driverRegister);

export default routerDriverRegisterModal;