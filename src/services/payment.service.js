
import axios from 'axios';
import crypto from 'crypto';

function encryptAES(text, secretKey) {
    const hash = crypto.createHash('sha256').update(secretKey).digest();
    const key16 = hash.slice(0, 16); 
    const cipher = crypto.createCipheriv('aes-128-ecb', key16, null);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
} 

export const verifyMercantilPayment = async (paymentData) => {
    const key = process.env.MERCANTIL_CIFRADO;
    const merchantIdClient = process.env.MERCANTIL_CLIENT_ID;
    const { phone, reference, amount, date } = paymentData;

    if (!key || !merchantIdClient || !process.env.MERCANTIL_URL) {
        throw new Error("Faltan variables de entorno de Mercantil");
    }

    const payload = {
        merchant_identify: {
            integratorId: "31",
            merchantId: merchantIdClient, 
            terminalId: "abcde"
        },
        client_identify: {
            ipaddress: "127.0.0.1",
            browser_agent: "Chrome 18.1.3",
            mobile: {
                manufacturer: "Samsung", model: "S21", os_version: "12",
                location: { lat: 0, lng: 0 }
            }
        },
        search_by: {
            amount: 153226, 
            currency: "ves",
            origin_mobile_number: encryptAES(phone, key), 
            destination_mobile_number: encryptAES("584142591177", key), 
            payment_reference: reference,
            trx_date: date
        }
    };

    const payloadString = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', key)
        .update(merchantIdClient + payloadString)
        .digest('hex');

    try {
        console.log("🚀 Enviando petición a Mercantil...");
        const response = await axios.post(process.env.MERCANTIL_URL, payload, {
            headers: {
                'X-IBM-Client-Id': merchantIdClient,
                'X-Signature': signature,
                'Content-Type': 'application/json'
            },
            timeout: 15000 
        });

        // 💡 RETORNO SI EL BANCO RESPONDE (200 OK)
        // Mercantil suele responder con un objeto que contiene 'payment_response' o similar
        if (response.data && (response.data.extraction_status === "COMPLETED" || response.data.status === "APPROVED")) {
            return { 
                success: true, 
                data: { txId: response.data.payment_reference || reference } 
            };
        }

        return { 
            success: false, 
            message: response.data.error_list?.[0]?.description || "Pago no encontrado o pendiente." 
        };

    } catch (error) {
        // 💡 RETORNO SI HAY ERROR (400, 500, Timeout, etc.)
        let errorMsg = "Error de comunicación con el banco.";
        
        if (error.response) {
            console.error("❌ Error API Mercantil:", error.response.data);
            errorMsg = error.response.data.error_list?.[0]?.description || errorMsg;
        }

        return { success: false, message: errorMsg };
    }
};



// import axios from 'axios';
// import crypto from 'crypto'; // 💡 Librería nativa de Node.js

// // 🔐 Función de cifrado según reglas de Mercantil (AES-128-ECB)
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
//     const merchantIdClient = process.env.MERCANTIL_CLIENT_ID

//         const { phone, reference, amount, date } = paymentData;

//     // 💡 IMPORTANTE: Mercantil requiere que el monto tenga 2 decimales exactos
//     const formattedAmount = parseFloat(amount).toFixed(2);
    
//     // Validar que las variables de entorno existan
//     if (!key || !process.env.MERCANTIL_CLIENT_ID || !process.env.MERCANTIL_URL) {
//         throw new Error("Faltan variables de entorno en el archivo .env");
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
//                 manufacturer: "Samsung",
//                 model: "S21",
//                 os_version: "12",
//                 location: { lat: 0, lng: 0 }
//             }
//         },
//         search_by: {
//             // amount: parseFloat(formattedAmount), 
//             amount: 153226,
//             currency: "ves",
//             origin_mobile_number: encryptAES(phone, key), 
//             destination_mobile_number: encryptAES("584142591177", key), 
//             payment_reference: reference,
//             trx_date: date
//         }
//     };

//     // Generar firma
//     const payloadString = JSON.stringify(payload);
//     const datatoSign = process.env.MERCANTIL_CLIENT_ID + payloadString;
//     const signature = crypto
//         .createHmac('sha256', key)
//         .update(datatoSign)
//         .digest('hex');

//     console.log("🚀 Enviando petición a Mercantil...");

//     try {
//         const response = await axios.post(process.env.MERCANTIL_URL, payload, {
//             headers: {
//                 'X-IBM-Client-Id': process.env.MERCANTIL_CLIENT_ID,
//                 'X-Signature': signature,
//                 'Content-Type': 'application/json',
//                 'Accept': 'application/json'
//             },
//             timeout: 15000 // 15 segundos de espera máxima
//         });

//         console.log("✅ RESPUESTA DEL BANCO RECIBIDA:");
//         console.log(JSON.stringify(response.data, null, 2));

//     } catch (error) {
//         if (error.response) {
//             // El servidor respondió con un código fuera del rango 2xx
//             console.error("❌ ERROR DEL SERVIDOR (Status " + error.response.status + "):");
//             console.error("Detalle:", JSON.stringify(error.response.data, null, 2));
//         } else if (error.request) {
//             // La petición se hizo pero no hubo respuesta (Timeout o red)
//             console.error("❌ NO SE RECIBIÓ RESPUESTA DEL BANCO. Revisa tu conexión o el firewall.");
//         } else {
//             console.error("❌ ERROR CONFIGURANDO LA PETICIÓN:", error.message);
//         }
//     }
// };
