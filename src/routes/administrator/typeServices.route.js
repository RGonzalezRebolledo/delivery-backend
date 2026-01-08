
import { Router } from "express";
import { getServices, createService } from "../../controllers/administrator/config/typeService.controller.js";

const routerServices  = Router();

// Agrupamos las rutas que comparten el mismo path
routerServices.route("/utils/service")
  .get(getServices)
  .post(createService);

export default routerServices;
