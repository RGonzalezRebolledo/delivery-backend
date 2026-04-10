import axios from 'axios';
import crypto from 'crypto';

// 🔐 Función de cifrado (Idéntica a tu script funcional)
function encryptAES(text, secretKey) {
    const stringText = String(text); // Blindaje para strings
    const hash = crypto.createHash('sha256').update(secretKey).digest();
    const key16 = hash.slice(0, 16); 
    
    const cipher = crypto.createCipheriv('aes-128-ecb', key16, null);
    cipher.setAutoPadding(true);
    
    let encrypted = cipher.update(stringText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}

export const verifyMercantilPayment = async (paymentData) => {
    const { phone, reference, amount, date } = paymentData;
    
    // Variables de entorno (Asegúrate de tener ambas en Railway)
    const key = process.env.MERCANTIL_CIFRADO;
    const clientId = process.env.MERCANTIL_CLIENT_ID;
    const merchantId = process.env.MERCANTIL_MERCHANT_ID; // 👈 LA CLAVE
    const url = process.env.MERCANTIL_URL;

    if (!key || !clientId || !merchantId || !url) {
        throw new Error("Faltan variables de entorno de Mercantil en el servidor");
    }

    const payload = {
        merchant_identify: {
            integratorId: "31",
            merchantId: merchantId, // Usamos Merchant ID aquí
            terminalId: "abcde"
        },
        client_identify: {
            ipaddress: "127.0.0.1",
            browser_agent: "Chrome 18.1.3",
            mobile: {
                manufacturer: "Samsung",
                model: "S21",
                os_version: "12",
                location: { lat: 0, lng: 0 }
            }
        },
        search_by: {
            amount: 153226, // Tal cual como en tu script (153226)
            currency: "ves",
            origin_mobile_number: encryptAES('584241513063', key), 
            destination_mobile_number: encryptAES("584142591177", key), 
            // payment_reference: String(reference),
            payment_reference: '84840006899',
            trx_date: date
        }
    };

    // Firma: ClientID + Payload
    const signature = crypto
        .createHmac('sha256', key)
        .update(clientId + JSON.stringify(payload))
        .digest('hex');

    try {
        console.log("🚀 Consultando pago en Mercantil...");
        const response = await axios.post(url, payload, {
            headers: {
                'X-IBM-Client-Id': clientId,
                'X-Signature': signature,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 15000
        });

        // Verificamos la respuesta según lo que te entrega el banco en tu script exitoso
        // Si el banco devuelve extraction_status o status
        const data = response.data;
        
        if (data && (data.extraction_status === "COMPLETED" || data.status === "APPROVED")) {
            return { 
                success: true, 
                data: { txId: data.payment_reference || reference } 
            };
        }

        return { 
            success: false, 
            message: data.error_list?.[0]?.description || "Pago no encontrado" 
        };

    } catch (error) {
        console.error("❌ Error en verificación:", error.response?.data || error.message);
        return { 
            success: false, 
            message: error.response?.data?.error_list?.[0]?.description || "Error de conexión bancaria" 
        };
    }
};

// import axios from 'axios';
// import crypto from 'crypto';

// function encryptAES(text, secretKey) {
//     const hash = crypto.createHash('sha256').update(secretKey).digest();
//     const key16 = hash.slice(0, 16); 
//     const cipher = crypto.createCipheriv('aes-128-ecb', key16, null);
//     cipher.setAutoPadding(true);
//     let encrypted = cipher.update(text, 'utf8', 'base64');
//     encrypted += cipher.final('base64');
//     return encrypted;
// } 

// export const verifyMercantilPayment = async (paymentData) => {
//     const key = process.env.MERCANTIL_CIFRADO;
//     const merchantIdClient = process.env.MERCANTIL_MERCHANT_ID;
//     const { phone, reference, amount, date } = paymentData;

//     if (!key || !merchantIdClient || !process.env.MERCANTIL_URL) {
//         throw new Error("Faltan variables de entorno de Mercantil");
//     }

//     const payload = {
//         merchant_identify: {
//             integratorId: "31",
//             merchantId: merchantIdClient, 
//             terminalId: "abcde"
//         },
//         client_identify: {
//             ipaddress: "127.0.0.1",
//             browser_agent: "Chrome 18.1.3",
//             mobile: {
//                 manufacturer: "Samsung", model: "S21", os_version: "12",
//                 location: { lat: 0, lng: 0 }
//             }
//         },
//         search_by: {
//             amount: 153226, 
//             currency: "ves",
//             origin_mobile_number: encryptAES('584241513063', key), 
//             destination_mobile_number: encryptAES("584142591177", key), 
//             payment_reference: '84840006899',
//             trx_date:"2026-04-10"
//         }
//     };

//     const payloadString = JSON.stringify(payload);
//     const signature = crypto.createHmac('sha256', key)
//         .update(merchantIdClient + payloadString)
//         .digest('hex');

//     try {
//         console.log("🚀 Enviando petición a Mercantil...");
//         const response = await axios.post(process.env.MERCANTIL_URL, payload, {
//             headers: {
//                 'X-IBM-Client-Id': merchantIdClient,
//                 'X-Signature': signature,
//                 'Content-Type': 'application/json'
//             },
//             timeout: 15000 
//         });

//         // 💡 RETORNO SI EL BANCO RESPONDE (200 OK)
//         // Mercantil suele responder con un objeto que contiene 'payment_response' o similar
//         if (response.data && (response.data.extraction_status === "COMPLETED" || response.data.status === "APPROVED")) {
//             return { 
//                 success: true, 
//                 data: { txId: response.data.payment_reference || reference } 
//             };
//         }

//         return { 
//             success: false, 
//             message: response.data.error_list?.[0]?.description || "Pago no encontrado o pendiente." 
//         };

//     }  catch (error) {
//         if (error.response) {
//             // Esto te dirá exactamente qué campo está mal (ej: "Monto no coincide" o "Referencia inválida")
//             console.error("❌ ERROR DEL BANCO:", JSON.stringify(error.response.data, null, 2));
//             console.error("STATUS CODE:", error.response.status);
//         } else {
//             console.error("❌ ERROR DE RED:", error.message);
//         }
        
//         return { 
//             success: false, 
//             message: error.response?.data?.error_list?.[0]?.description || "No se pudo localizar el pago." 
//         };
//     }
// };
