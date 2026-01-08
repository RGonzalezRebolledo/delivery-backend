
import { Router } from "express";
import { 
  getVehicles, 
  createVehicle 
} from "../../controllers/administrator/config/typeVehicle.controller.js";

const routerVehicles  = Router();

// Agrupamos las rutas que comparten el mismo path
routerVehicles .route("/utils/vehicle")
  .get(getVehicles)
  .post(createVehicle);

export default routerVehicles;
