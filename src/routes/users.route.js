import {Router} from 'express';
import { createUser, getAllUsers, updateUser } from '../controllers/users.controller.js';

const routerUsers = Router();

// agregar usuarios
routerUsers.post('/users', createUser);

// obtener usuarios
routerUsers.get('/users', getAllUsers);

//actualizar usuario
routerUsers.put('/users/:id_usuario', updateUser)

export default routerUsers