import { Router } from "express";
import { verifyToken } from '../middlewares/verifyToken.js'; // 👈 Importar el middleware
import { registerDriverInterview } from "../../controllers/drivers/driverRegisterModal.controller.js";
import { suspendDriver } from "../../controllers/drivers/driverSuspend.controller.js";

const routerDriverRegisterModal = Router();

routerDriverRegisterModal.post('/driver/driver-register-modal',verifyToken, registerDriverInterview );
routerDriverRegisterModal.put('/driver/suspend-driver', verifyToken, suspendDriver);

export default routerDriverRegisterModal;   