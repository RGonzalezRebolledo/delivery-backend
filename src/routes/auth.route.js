import { Router } from 'express';
import { logoutUser } from '../controllers/auth.controller.js'; 
import { verifyToken, checkSesion } from './middlewares/verifyToken.js';

const router = Router();

// Agregamos verifyToken para identificar al usuario que cierra sesión
router.post('/logout', verifyToken, logoutUser); 

// Ruta para verificar sesión al cargar la app
router.get('/check-session', verifyToken, checkSesion);

export default router;


// import { Router } from 'express';
// import { logoutUser } from '../controllers/auth.controller.js'; 

// const router = Router();

// // Ruta POST (o GET, aunque POST es preferido para acciones)
// router.post('/logout', logoutUser); 

// export default router;