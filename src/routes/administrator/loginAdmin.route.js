import {Router} from 'express'
import { validateUserAdmin } from '../../controllers/administrator/loginAdmin.controller.js';

const routerLoginAdmin = Router();

// verifico si el usuario esta registrado correctamente
routerLoginAdmin.post('/login/admin',validateUserAdmin)

export default routerLoginAdmin