// Ejemplo de rutas en Express
export const checkSesion = async (req, res) => {
    // Si llegamos aquí, el token es válido.
    // req.userId y req.userTipo fueron inyectados por verifyToken.
    // Solo necesitamos devolver un mensaje de éxito con los datos del usuario.
    res.status(200).json({ 
        message: "Sesión activa.",
        user: { 
            id: req.userId,
            tipo: req.userTipo,
            nombre: req.userName
            // (Opcional) Puedes hacer una pequeña consulta a la BD para obtener el nombre completo si lo necesitas aquí.
        }
    });
};

//Al implementar el `loading` en el `AuthContext`, el `ClientDashboard` ahora esperará a que `loading` sea `false` antes de intentar hacer la petición de pedidos, resolviendo así el error.