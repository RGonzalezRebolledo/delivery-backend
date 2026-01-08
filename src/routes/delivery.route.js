import { Router } from 'express';
import { calculateDeliveryCost } from '../controllers/delivery.controller.js';

const routerCalculateDeliveryCost = Router();

// Ruta para calcular el costo del delivery basado en zonas.
// El frontend hará un POST a esta ruta con las direcciones.
// Ejemplo de endpoint: POST /api/delivery/calculate-cost
routerCalculateDeliveryCost.post('/calculate-cost', calculateDeliveryCost);

// NOTA IMPORTANTE: Asegúrate de registrar este router en tu aplicación principal (ej. en index.js)
// app.use('/api/delivery', router); 

export default routerCalculateDeliveryCost;