
import { Router } from "express";
import { 
  getVehicles, 
  createVehicle 
} from "../../controllers/administrator/config/typeVehicle.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const routerVehicles  = Router();

// Agrupamos las rutas que comparten el mismo path
routerVehicles .route("/utils/vehicle", verifyToken,)
  .get(getVehicles)
  .post(createVehicle);

export default routerVehicles;
