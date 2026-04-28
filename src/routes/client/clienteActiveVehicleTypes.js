import { Router } from "express";
import { verifyToken } from '../middlewares/verifyToken.js';
import { getActiveVehicleTypes } from "../../controllers/client/clientActiveVehicleTypes.js"; 
const routerActiveVehicleTypes = Router();

// Endpoint para que el cliente sepa qué vehículos hay disponibles en tiempo real
routerActiveVehicleTypes.get('/client/active-vehicles', verifyToken, getActiveVehicleTypes);

export default routerActiveVehicleTypes;