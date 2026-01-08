/**
 * Servicio para calcular el precio del delivery basado en Zonas geográficas
 * derivadas de las direcciones textuales de recogida y entrega.
 * * Se basa en la "Opción 1: Modelo de Precios Basado en Zonas".
 */

// 1. DEFINICIÓN DE LA MATRIZ DE PRECIOS FIJOS (Zona Origen x Zona Destino)
// Los precios son fijos en USD.
const PRICE_MATRIX = {
    // Zona A (Central/Premium)
    'A-A': 1.00,  // Origen A -> Destino A
    'A-B': 3.00,  // Origen A -> Destino B
    'A-C': 3.00, // Origen A -> Destino C

    // Zona B (Intermedia/Residencial)
    'B-A': 7.00,
    'B-B': 10.00,
    'B-C': 12.00,

    // Zona C (Periférica/Remota)
    'C-A': 20.00,
    'C-B': 25.00,
    'C-C': 30.00,
};

/**
 * Función auxiliar que asigna una dirección textual a una Zona (A, B, C).
 * Esta lógica debe ser robusta e incluir todos los nombres de zonas relevantes.
 * @param {string} address - La dirección ingresada por el cliente.
 * @returns {string} La Zona asignada ('A', 'B', 'C', o 'UNKNOWN').
 */
const determineZone = (address) => {
    // Normalizar la dirección para hacer la búsqueda insensible a mayúsculas/minúsculas y acentos
    const normalizedAddress = address.toLowerCase();

    // ZONA A (Ejemplo: Distritos Centrales, Alta Concentración Comercial)
    if (
        normalizedAddress.includes('san fernando') || 
        normalizedAddress.includes('av caracas') || 
        normalizedAddress.includes('av carabobo') ||
        normalizedAddress.includes('av miranda') ||
        normalizedAddress.includes('av carabobo') ||
        normalizedAddress.includes('urb tamarindo') ||
        normalizedAddress.includes('calle diamante') ||
        normalizedAddress.includes('sector centro') 
    ) {
        return 'A';
    }

    // ZONA B (Ejemplo: Distritos Intermedios, Zonas Residenciales Densas)
    if (
        normalizedAddress.includes('prados del este') || 
        normalizedAddress.includes('los palos grandes') || 
        normalizedAddress.includes('la trinidad')
    ) {
        return 'B';
    }

    // ZONA C (Ejemplo: Distritos Periféricos o con Acceso más complejo)
    if (
        normalizedAddress.includes('petare') || 
        normalizedAddress.includes('guarenas') || 
        normalizedAddress.includes('el valle')
    ) {
        return 'C';
    }

    // Si no se encuentra una coincidencia, lo marcamos como desconocido
    return 'UNKNOWN'; 
};

/**
 * Calcula el precio base del delivery en USD usando la Matriz de Precios por Zona.
 * @param {string} pickupAddress - Dirección de recogida.
 * @param {string} deliveryAddress - Dirección de entrega.
 * @returns {number} El costo del delivery en USD, o 0 si es desconocido.
 */
export const getDeliveryPrice = (pickupAddress, deliveryAddress) => {
    // 1. Determinar las Zonas
    const originZone = determineZone(pickupAddress);
    const destinationZone = determineZone(deliveryAddress);

    // 2. Manejo de Zonas Desconocidas/No Cubiertas
    if (originZone === 'UNKNOWN' || destinationZone === 'UNKNOWN') {
        console.warn(`Una dirección no pudo ser asignada a una zona: Origen=${originZone}, Destino=${destinationZone}`);
        // Devolvemos 0, o puedes devolver un precio de error alto o lanzar una excepción.
        // En este caso, devolvemos 0 para forzar un mensaje de error en el frontend.
        return 0; 
    }

    // 3. Buscar la clave en la Matriz de Precios
    const key = `${originZone}-${destinationZone}`;
    const priceUSD = PRICE_MATRIX[key];

    // 4. Devolver el precio encontrado
    if (priceUSD !== undefined) {
        return priceUSD;
    } else {
        // Esto solo debería pasar si la Matriz está mal configurada
        console.error(`ERROR FATAL: Clave de precio no encontrada para ${key}`);
        return 0; 
    }
};

// NOTA: Para incluir el factor de peso, puedes modificar esta función 
// para agregar un recargo si el peso excede un límite (ej. 5kg).
/*
export const getDeliveryPrice = (pickupAddress, deliveryAddress, weightKg) => {
    // ... lógica de zonas ...
    let priceUSD = PRICE_MATRIX[key];
    
    // Recargo por peso
    if (weightKg > 5) {
        priceUSD += 3.00; // Recargo de $3.00 por sobrepeso
    }

    return priceUSD;
};
*/