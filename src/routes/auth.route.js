import { Router } from 'express';
import { logoutUser } from '../controllers/auth.controller.js'; 

const router = Router();

// Ruta POST (o GET, aunque POST es preferido para acciones)
router.post('/logout', logoutUser); 

export default router;