import { Router } from "express";
import { verifyToken } from '../middlewares/verifyToken.js'; // 👈 Importar el middleware
import { getClientAddresses } from "../../controllers/client/clientaddresses.controller.js";


const routerClientAddresses = Router();

routerClientAddresses.get('/client/addresses',verifyToken, getClientAddresses);

export default routerClientAddresses;