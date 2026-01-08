import { Router } from "express";
import { getBcvExchangeRate } from "../../controllers/apis/exchangeRate.controller.js";

const routerExchangeRate = Router();

// RUTA GET para obtener la tasa de cambio
// NOTA: No necesita verifyToken porque es información pública
routerExchangeRate.get('/api/exchange-rate', getBcvExchangeRate);

export default routerExchangeRate;