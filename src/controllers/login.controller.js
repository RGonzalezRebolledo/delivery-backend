
import { pool } from '../db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const validateUser = async (req, res) => {
    const { email, password, tipo } = req.body; 

    // 1. Validación de entrada obligatoria
    if (!email || !password) {
        return res.status(400).json({ error: "Faltan el email o la contraseña." });
    }

    try {
        // 2. Buscar al usuario
        const resultUser = await pool.query(
            'SELECT id, email, password_hash, tipo, nombre FROM usuarios WHERE email = $1', 
            [email]
        );

        if (resultUser.rows.length === 0) {
            return res.status(401).json({ error: 'Email o clave incorrecta' });
        }

        const user = resultUser.rows[0];
        
        // 3. Comparar contraseñas
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Email o clave incorrecta' });
        }

        // 💡 4. VALIDACIÓN CONDICIONAL DEL TIPO DE USUARIO
        // Solo se ejecuta si 'tipo' existe y no es un string vacío
        if (tipo && tipo.trim() !== "") {
            if (user.tipo !== tipo) {
                // Pequeño ajuste para mostrar "conductor" si es "repartidor" en la base de datos
                const tipoAmigable = user.tipo === 'repartidor' ? 'conductor' : user.tipo;
                
                return res.status(403).json({ 
                    error: `El usuario ${tipo} no existe.` 
                });
            }
        }

        // 5. Generar el JWT
        const tokenPayload = {
            id: user.id,
            email: user.email,
            tipo: user.tipo,
            nombre: user.nombre
        };

        const token = jwt.sign(
            tokenPayload,
            // process.env.JWT_SECRET,
            'palabrasecreta',
            { expiresIn: '1d' }
        );

        // 6. Establecer Cookie
        // res.cookie('accessToken', token, {
        //     httpOnly: true,
        //     secure: process.env.NODE_ENV === 'production',
        //     sameSite: 'Lax',
        //     maxAge: 24 * 60 * 60 * 1000
        // });
        
        // En validateUser y createUser
res.cookie('accessToken', token, {
    httpOnly: true,    // Protege contra XSS
    secure: true,      // OBLIGATORIO para sameSite: 'none' (Funciona en Railway con HTTPS)
    sameSite: 'none',  // OBLIGATORIO para comunicación entre Vercel y Railway
    maxAge: 24 * 60 * 60 * 1000 // 1 día
});

        // 7. Respuesta exitosa
        return res.status(200).json({ 
            message: 'Acceso concedido. Cookie establecida.', 
            user: { 
                email: user.email, 
                tipo: user.tipo,
                nombre: user.nombre,
                id: user.id
            } 
        });
        
    } catch (error) {
        console.error("Error en validateUser:", error);
        return res.status(500).json({ error: 'Error en el servidor durante la autenticación' });
    }
};

// import { pool } from '../db.js';
// import bcrypt from 'bcrypt';
// import jwt from 'jsonwebtoken'; // 💡 NECESARIO para generar el token

// export const validateUser = async (req, res) => {
//     const { email, password, tipo } = req.body; 

//     // Validación de entrada
//     if (!email || !password) {
//         return res.status(400).json({ error: "Faltan el email o la contraseña." });
//     }

//     try {
//         // 1. Buscar al usuario y obtener su hash, id, tipo, etc.
//         const resultUser = await pool.query(
//             'SELECT id, email, password_hash, tipo, nombre FROM usuarios WHERE email = $1', 
//             [email]
//         );

        

//         if (resultUser.rows.length === 0) {
//             return res.status(401).json({ error: 'Email o clave incorrecta' }); // No revelar si es el usuario o la clave
//         }

//         const user = resultUser.rows[0];
        
//         // 2. Compara el hash con el password enviado
//         const isPasswordValid = await bcrypt.compare(password, user.password_hash);

//         if (!isPasswordValid) {
//             return res.status(401).json({ error: 'Email o clave incorrecta' }); // No revelar si es el usuario o la clave
//         }

//         // 💡 2.5 VALIDACIÓN DEL TIPO DE USUARIO
//         // Verificamos si se envió un tipo en el body y si coincide con el de la BD
//         let useConducto;
//         if (tipo && user.tipo !== tipo) {
//           const useConducto = user.tipo === 'repartidor' ? 'conductor' : user.tipo;
//           return res.status(403).json({ 
//               error: `No tienes permisos para acceder como ${tipo}. Tu cuenta es de tipo ${useConducto}.` 
//           });
//       }

//         // 3. Generar el JSON Web Token (JWT)
//         const tokenPayload = {
//             id: user.id,
//             email: user.email,
//             tipo: user.tipo,
//             nombre: user.nombre
//         };

//         const token = jwt.sign(
//             tokenPayload,
//             process.env.JWT_SECRET, // ¡Usar la variable de entorno!
//             { expiresIn: '1d' }      // Token expira en 1 día
//         );

//         // 4. Establecer el token como una cookie HTTP-Only (PASO CRUCIAL)
//         res.cookie('accessToken', token, {
//             httpOnly: true,                                // 🔒 Inaccesible desde JavaScript (Protección XSS)
//             secure: process.env.NODE_ENV === 'production', // true solo si usas HTTPS (producción)
//             sameSite: 'Lax',                               // Ayuda a mitigar ataques CSRF
//             maxAge: 24 * 60 * 60 * 1000                    // 1 día en milisegundos
//         });

//         // 5. Respuesta exitosa con datos públicos
//         // El token se envía en la cookie; aquí solo enviamos los datos del usuario necesarios para el frontend
//         return res.status(200).json({ 
//             message: 'Acceso concedido. Cookie establecida.', 
//             user: { 
//                 email: user.email, 
//                 tipo: user.tipo,
//                 nombre: user.nombre,
//                 id: user.id
//             } 
//         });
        
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ error: 'Error en el servidor durante la autenticación' });
//     }
// };




// import { pool } from '../db.js';
// import bcrypt from 'bcrypt';  // Asegúrate de instalarlo

// export const validateUser = async (req, res, next) => {
//   const { email, password } = req.body;  // Cambia a 'password' para consistencia con React
//   try {
//     const resultUser = await pool.query('SELECT email, password_hash FROM usuarios WHERE email = $1', [email]);
//     if (resultUser.rows.length === 0) {
//       return res.status(404).json({ error: 'Usuario no encontrado' });
//     }
//     const user = resultUser.rows[0];
//     // Compara el hash con el password enviado usando bcrypt
//     const isPasswordValid = await bcrypt.compare(password, user.password_hash);
//     if (!isPasswordValid) {
//       return res.status(401).json({ error: 'Clave incorrecta' });
//     }
//     // Respuesta exitosa con objeto JSON
//     return res.status(200).json({ message: 'Acceso concedido', user: { email: user.email } });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ error: 'Error en el servidor' });
//   }
// };

