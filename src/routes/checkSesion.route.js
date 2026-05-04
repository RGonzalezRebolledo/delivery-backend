import { Router } from "express"
import { checkSesion } from "./middlewares/checkSesionviejo.js"
import { verifyToken } from './middlewares/verifyToken.js';

const routerCheckSesion = Router();
routerCheckSesion.get('/check-session', verifyToken,checkSesion);

export default routerCheckSesion;