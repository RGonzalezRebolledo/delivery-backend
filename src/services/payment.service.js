import axios from 'axios';
import crypto from 'crypto'; // 💡 Librería nativa de Node.js

export const verifyMercantilPayment = async (paymentData) => {
    const { phone, reference, amount, date } = paymentData;

    // 💡 IMPORTANTE: Mercantil requiere que el monto tenga 2 decimales exactos
    const formattedAmount = parseFloat(amount).toFixed(2);

    const payload = {
        customer: {
            national_id: process.env.MERCANTIL_CI, // Tu CI/RIF registrado en el portal
            country: "VEN",
            currency: "VES"
        },
        merchant: {
            merchant_id: process.env.MERCANTIL_MERCHANT_ID // 💡 Aquí va el Merchant ID
        },
        payment: {
            payer_phone: phone,
            reference: reference,
            amount: parseFloat(formattedAmount),
            date: date
        }
    };

    // 🔐 GENERACIÓN DE LA FIRMA (X-Signature)
    // Se concatena el ClientId + Payload y se firma con el SecretKey
    const stringToSign = process.env.MERCANTIL_IDENTIFIER + JSON.stringify(payload);
    const signature = crypto
        .createHmac('sha256', process.env.MERCANTIL_KEY)
        .update(stringToSign)
        .digest('hex');

    try {
        const response = await axios.post(process.env.MERCANTIL_URL, payload, {
            headers: {
                'X-IBM-Client-Id': process.env.MERCANTIL_IDENTIFIER,
                'X-IBM-Client-Secret': process.env.MERCANTIL_KEY,
                'X-Signature': signature, // 💡 Obligatorio en producción
                'Content-Type': 'application/json'
            }
        });

        // Verificamos si el estado es completado
        if (response.data && response.data.extraction_status === "COMPLETED") {
            return { 
                success: true, 
                data: {
                    txId: response.data.payment?.reference || reference,
                    raw: response.data 
                } 
            };
        }
        
        // Si no es completado, devolvemos el mensaje del banco
        const bankError = response.data.error_list?.[0]?.description || "Pago no encontrado";
        return { success: false, message: bankError };

    } catch (error) {
        // Extraemos el error real del cuerpo de la respuesta de Mercantil
        const apiError = error.response?.data?.error_list?.[0]?.description 
                         || error.message 
                         || "Error de conexión con el banco";
        
        console.error("Detalle Error Mercantil:", error.response?.data || error.message);
        
        return { success: false, message: apiError };
    }
};