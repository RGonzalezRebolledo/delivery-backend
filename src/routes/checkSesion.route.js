import { Router } from "express"
import { checkSesion } from "./middlewares/checkSesion.js"
import { verifyToken } from './middlewares/verifyToken.js';

const routerCheckSesion = Router();
routerCheckSesion.get('/check-session', verifyToken,checkSesion);

export default routerCheckSesion;