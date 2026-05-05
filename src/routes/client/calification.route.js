import { Router } from "express";
import { verifyToken } from "../middlewares/verifyToken.js"; // 👈 Importar el middleware
import { getPendingRating, submitRating} from "../../controllers/client/calification.controller.js";

const routerPendintCalification = Router();

// Ejemplo en tus rutas de cliente
routerPendintCalification.get("/pendiente-calificar", verifyToken ,getPendingRating);
routerPendintCalification.post("/enviar-calificacion", verifyToken ,submitRating);

export default routerPendintCalification;
