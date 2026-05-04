
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET; 

export const verifyToken = (req, res, next) => {
    const token = req.cookies.accessToken; 
    
    // Si no hay token y no es logout, error 401
    if (!token) {
        if (req.path === '/logout') return next(); // Permitir logout sin token
        return res.status(401).json({ message: 'Acceso denegado. Inicia sesión.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id; 
        req.userTipo = decoded.tipo;
        req.userName = decoded.nombre;
        next();
    } catch (err) {
        console.error("Error JWT:", err.message);
        res.clearCookie('accessToken'); 
        
        // Si es logout, no bloqueamos con 403, dejamos que limpie lo que pueda
        if (req.path === '/logout') return next();

        return res.status(403).json({ message: 'Sesión expirada.' });
    }
};

export const checkSesion = async (req, res) => {
    res.status(200).json({ 
        message: "Sesión activa.",
        user: { id: req.userId, tipo: req.userTipo, nombre: req.userName }
    });
};


// import jwt from 'jsonwebtoken';

// // 💡 DEBES CONFIGURAR ESTO:
// // Se recomienda usar 'process.env.JWT_SECRET' en producción.
// // Reemplaza el valor por defecto si no estás usando variables de entorno
// // const JWT_SECRET = process.env.JWT_SECRET || 'TU_SECRETO_SEGURO_DEBES_CAMBIARLO'; 
// const JWT_SECRET =  process.env.JWT_SECRET; 

// /**
//  * Middleware para verificar la validez del JWT.
//  * * Busca el token en la cookie 'accessToken' (requiere el middleware 'cookie-parser' 
//  * en el servidor Express para funcionar).
//  * * @param {object} req - Objeto de la petición de Express
//  * @param {object} res - Objeto de la respuesta de Express
//  * @param {function} next - Función para pasar al siguiente controlador/middleware
//  */
// export const verifyToken = (req, res, next) => {
//     // 1. Obtener el token de la cookie 'accessToken'
//     // Requiere que uses 'cookie-parser' en tu servidor Express.
//     const token = req.cookies.accessToken; 
    
//     if (!token) {
//         // 401: No autorizado (token no presente)
//         return res.status(401).json({ message: 'Acceso denegado. No se encontró la cookie de sesión. Por favor, inicia sesión.' });
//     }

//     try {
//         // 2. Verificar y decodificar el token usando la clave secreta
//         const decoded = jwt.verify(token, JWT_SECRET);
        
//         // 3. Adjuntar el ID de usuario al objeto de la petición (req)
//         // Esto permite que el controlador (ej. getClientOrders) acceda al ID: req.userId
//         // El ID debe estar presente en el payload de tu token (tokenPayload.id)
//         req.userId = decoded.id; 

//         // Opcional: Adjuntar el tipo de usuario (útil para validar permisos)
//         req.userTipo = decoded.tipo;
//         req.userName = decoded.nombre;
        
//         // 4. Continuar al controlador
//         next();

//     } catch (err) {
//         // 5. Manejar error si el token no es válido (expirado, modificado, firma incorrecta)
//         console.error("Error de verificación de token (JWT):", err.message);
        
//         // Limpiar la cookie para forzar un nuevo inicio de sesión
//         res.clearCookie('accessToken'); 
        
//         // 403: Prohibido (token presente pero inválido o expirado)
//         return res.status(403).json({ message: 'Sesión inválida o expirada. Por favor, inicia sesión de nuevo.' });
//     }
// };