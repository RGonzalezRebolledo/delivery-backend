import bcryptjs from 'bcryptjs'
import { pool } from "../db.js";
import jwt from 'jsonwebtoken'

// FUNCION PARA VALIDAR EL MAIL Y LA LICENCIA

// async function checkUserExistence(pool, email, licencia_medica) {
  
// // Consulta para verificar si ya existe un usuario con el mismo email O la misma licencia_medica
// const userExists = await pool.query(
//   "SELECT email, licencia_medica FROM Usuarios WHERE email = $1 OR licencia_medica = $2",
//   [email, licencia_medica]
// );

// if (userExists.rows.length > 0) {
//   // Si encontramos alguna fila, significa que al menos uno de los campos ya existe
//   const existingUser = userExists.rows[0]; // Tomamos la primera coincidencia

//   if (
//     existingUser.email === email &&
//     existingUser.licencia_medica === licencia_medica
//   ) {
//     // Ambos campos ya existen en el mismo usuario, lo cual es redundante pero indica conflicto.
//     return res
//       .status(409)
//       .json({
//         message: "El usuario con este email y licencia médica ya existe.",
//       });
//   } else if (existingUser.email === email) {
//     // Solo el email ya existe
//     return res
//       .status(409)
//       .json({
//         message: "El email ya está registrado. Por favor, verifique.",
//       });
//   } else if (existingUser.licencia_medica === licencia_medica) {
//     // Solo la licencia médica ya existe
//     return res
//       .status(409)
//       .json({
//         message:
//           "La licencia médica ya está registrada. Por favor, verifique.",
//       });
//   }
// }
// }

// FUNCION CALLBACK PARA VALIDAR

async function checkUserExistence(pool, email) {
  // Consulta para verificar si ya existe un usuario con el mismo email O la misma licencia_medica
  const userExists = await pool.query(
    "SELECT email FROM Usuarios WHERE email = $1",
    [email]
  );

  if (userExists.rows.length > 0) {
    const existingUser = userExists.rows[0];

   if (existingUser.email === email) {
      return {
        status: 409,
        message: "El email ya está registrado. Por favor, verifique.",
      };
    }
  }
  // Si no se encuentra ningún usuario, retornamos null o undefined,
  // lo que indica que no hay conflicto y se puede proceder con la creación.
  return null;
}


//REGISTRAR USUARIO

export const createUser = async (req, res, next) => {
  const { password_hash, nombre, email, telefono, tipo } =
    req.body;

  //VALIDO QUE NO FALTE ALGUN DATO RECIBIDO
  if (
    !password_hash ||
    !nombre ||
    !telefono ||
    !tipo ||
    !email
  ) {
    return res
      .status(409)
      .json({ error: "todos los datos son requeridos, verifique" });
  }


  // CREO EL HASH DEL PASSWORD
  // creo saltos para evitar crear hash iguales en caso que las contrasenas sean iguales
const salt = await bcryptjs.genSalt (10) 
// creo el hash
const hashedpassword = await bcryptjs.hash(password_hash,salt)
  try {
        // 1. Verificar la existencia del usuario antes de proceder
        const existenceCheckResult = await checkUserExistence(pool, email);

        if (existenceCheckResult) {
          // Si existenceCheck no es null, significa que hay un conflicto
          return res.status(existenceCheckResult.status).json({
            message: existenceCheckResult.message
          });
        }

    const newUser = await pool.query(
      "INSERT INTO Usuarios (password_hash, nombre, tipo,telefono,email) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [hashedpassword, nombre, tipo, telefono, email]
    );

      // creo el token 
      // const token = jwt.sign ({
      //   email: newUser.rows.email
      // },
      // process.env.JWT_SECRET,
      // {
      //   expiresIn: '1h'
      // }
      // )

      const token = jwt.sign ({
        email: newUser.rows[0].email, // Asegúrate de que apunte al email
        tipo: newUser.rows[0].tipo,     // Es útil incluir el tipo/rol
        nombre: newUser.rows[0].nombre,
        id: newUser.rows[0].id
    },
    // process.env.JWT_SECRET,
    'palabrasecreta',
    {
        expiresIn: '1h'
    });

    // 💡 CAMBIO CLAVE: Configurar el token como una Cookie HTTP-Only
// res.cookie('accessToken', token, {
//   httpOnly: true,             // INACCESIBLE desde JavaScript (Protección XSS)
//   secure: process.env.NODE_ENV === 'production', // Solo enviar en HTTPS en producción
//   sameSite: 'Lax',            // O 'Strict' o 'None' (ajustar por seguridad/CORS)
//   maxAge: 3600000             // 1 hora en milisegundos (mismo que expiresIn)
// });

// En validateUser y createUser
res.cookie('accessToken', token, {
  httpOnly: true,    // Protege contra XSS
  secure: true,      // OBLIGATORIO para sameSite: 'none' (Funciona en Railway con HTTPS)
  sameSite: 'none',  // OBLIGATORIO para comunicación entre Vercel y Railway
  maxAge: 24 * 60 * 60 * 1000 // 1 día
});
    res.status(201).json({ mensaje: token });
  
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "ocurrio un error en el servidor" });
  }
};




//OBTENER USUARIOS

export const getAllUsers = async (req, res, next) => {
  try {
    const allUsers = await pool.query("SELECT * FROM Usuarios");
    res.status(200).json(allUsers.rows);
  } catch (error) {
    res.status(500).json({ message: "error del servidor" });
  }
};

// ACTUALIZAR USUARIO

export const updateUser = async (req, res, next) => {
  const {id_usuario} = req.params;
  const { password_hash, nombre, tipo, telefono} = req.body;

  // VERIFICO SI TENGO TODOS LOS DATOS 
  if ( !password_hash || !nombre || !tipo || !telefono ) {
    return res.status(409).json({message: 'no deben existir casillas con datos faltantes'})
  }

  try {
    
    const updateResult = await pool.query(
      "UPDATE Usuarios SET password_hash = $1, nombre = $2, tipo = $3 WHERE id_usuario = $4 RETURNING *", [password_hash, nombre, tipo, id_usuario]
    );
    

    if (updateResult.rows.length === 0)
    return res.status(404).json({ message: "usuario no existe" });

    res.status(200).json(updateResult.rows[0]);
  
} catch (error) {
  console.log (error)
res.status (409).json({message: 'error en la respuesta del servidor'})  
}
};


