import { Router } from "express";
import { verifyToken } from "../../../middlewares/verifyToken.js";
import { getAvailableDrivers } from "../../../../controllers/drivers/driverAvailableDrivers.controller.js";


const routerActiveDrivers = Router();

routerActiveDrivers.get('/managment/drivers/available', verifyToken, getAvailableDrivers);

export default routerActiveDrivers;