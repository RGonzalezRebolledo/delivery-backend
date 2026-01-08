import {Router} from 'express'
import { validateUser } from '../controllers/login.controller.js';

const routerLogin = Router();

// verifico si el usuario esta registrado correctamente
routerLogin.post('/login',validateUser)

export default routerLogin