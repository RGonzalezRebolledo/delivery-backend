/**
 * Controlador para cerrar la sesión del usuario.
 * Elimina la cookie 'accessToken' del navegador.
 */
export const logoutUser = async (req, res) => {
    try {
        // 1. Limpiar la cookie 'accessToken'
        // Usamos res.clearCookie() para decirle al navegador que elimine la cookie.
        // Es importante pasar el mismo nombre ('accessToken') y, a veces, las mismas
        // opciones que se usaron al configurarla (excepto maxAge/expires).
        // res.clearCookie('accessToken', {
        //     httpOnly: true,
        //     secure: process.env.NODE_ENV === 'production',
        //     sameSite: 'Lax',
        // });

        res.clearCookie('accessToken', {
            httpOnly: true,
            // ⚠️ IMPORTANTE: Estos deben ser idénticos a los del Login/Registro
            secure: true, 
            sameSite: 'none', 
        });

        // 2. Enviar respuesta de éxito
        return res.status(200).json({ message: "Sesión cerrada exitosamente." });

    } catch (error) {
        console.error("Error al cerrar la sesión:", error);
        return res.status(500).json({ error: "Ocurrió un error en el servidor al intentar cerrar la sesión." });
    }
};