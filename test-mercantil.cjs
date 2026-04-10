
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const merchantId = process.env.MERCANTIL_MERCHANT_ID

// 🔐 Función de cifrado según reglas de Mercantil (AES-128-ECB)
function encryptAES(text, secretKey) {
    const hash = crypto.createHash('sha256').update(secretKey).digest();
    const key16 = hash.slice(0, 16); 
    
    const cipher = crypto.createCipheriv('aes-128-ecb', key16, null);
    cipher.setAutoPadding(true);
    
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}

async function testCertificacion() {
    const key = process.env.MERCANTIL_CIFRADO;
    
    // Validar que las variables de entorno existan
    if (!key || !process.env.MERCANTIL_CLIENT_ID || !process.env.MERCANTIL_URL) {
        throw new Error("Faltan variables de entorno en el archivo .env");
    }

    const payload = {
        merchant_identify: {
            integratorId: "31",
            merchantId: merchantId, 
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
            amount: 153226, 
            currency: "ves",
            origin_mobile_number: encryptAES("584241513063", key), 
            destination_mobile_number: encryptAES("584142591177", key), 
            payment_reference: "84840006899",
            trx_date: "2026-04-10"
        }
    };

    // Generar firma
    const payloadString = JSON.stringify(payload);
    const datatoSign = process.env.MERCANTIL_CLIENT_ID + payloadString;
    const signature = crypto
        .createHmac('sha256', key)
        .update(datatoSign)
        .digest('hex');

    console.log("🚀 Enviando petición a Mercantil...");

    try {
        const response = await axios.post(process.env.MERCANTIL_URL, payload, {
            headers: {
                'X-IBM-Client-Id': process.env.MERCANTIL_CLIENT_ID,
                'X-Signature': signature,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 15000 // 15 segundos de espera máxima
        });

        console.log("✅ RESPUESTA DEL BANCO RECIBIDA:");
        console.log(JSON.stringify(response.data, null, 2));

    } catch (error) {
        if (error.response) {
            // El servidor respondió con un código fuera del rango 2xx
            console.error("❌ ERROR DEL SERVIDOR (Status " + error.response.status + "):");
            console.error("Detalle:", JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            // La petición se hizo pero no hubo respuesta (Timeout o red)
            console.error("❌ NO SE RECIBIÓ RESPUESTA DEL BANCO. Revisa tu conexión o el firewall.");
        } else {
            console.error("❌ ERROR CONFIGURANDO LA PETICIÓN:", error.message);
        }
    }
}

// 🏁 INVOCACIÓN CONTROLADA (Obliga a Node a esperar la respuesta)
console.log("--- Iniciando Script de Gazzella Express ---");
testCertificacion()
    .then(() => console.log("\n--- Proceso finalizado ---"))
    .catch(err => console.error("\n💥 Error fatal:", err));


// const axios = require('axios');
// const crypto = require('crypto');
// require('dotenv').config();


// // 🔐 Función de cifrado según reglas de Mercantil
// function encryptAES(text, secretKey) {
//     const hash = crypto.createHash('sha256').update(secretKey).digest();
//     const key16 = hash.slice(0, 16); // Primeros 16 bytes del SHA-256
    
//     const cipher = crypto.createCipheriv('aes-128-ecb', key16, null);
//     cipher.setAutoPadding(true);
    
//     let encrypted = cipher.update(text, 'utf8', 'base64');
//     encrypted += cipher.final('base64');
//     return encrypted;
// }

// async function testCertificacion() {
//     const key = process.env.MERCANTIL_CIFRADO;

//     // Los valores de búsqueda deben ir CIFRADOS en Base64/UTF8
//     const payload = {
//         merchant_identify: {
//             integratorId: "1",
//             merchantId: "200284", // Asegúrate que este sea el de tu comercio
//             terminalId: "1"
//         },
//         client_identify: {
//             ipaddress: "127.0.0.1",
//             browser_agent: "GazzellaExpress",
//             mobile: {
//                 manufacturer: "Samsung",
//                 model: "S21",
//                 os_version: "12",
//                 location: {
//                     lat: 0,
//                     lng: 0
//                 }
//             }
//         },
//         search_by: {
//             // 🔐 Solo ciframos los datos que el banco pide validar
//             amount: 463590, // Déjalo como número por ahora
//             currency: "ves",
//             origin_mobile_number: encryptAES("584142591177", key), 
//             destination_mobile_number: encryptAES("584241513063", key), // Ojo: corregí el número que tenía un 5 de más
//             payment_reference: '048310026124',
//             trx_date: "2026-04-07"
//             // payment_reference: encryptAES("048310026124", key),
//             // trx_date: encryptAES("2026-04-07", key)
//         }
//     };

//     // La firma se genera con el Client_Id + JSON (ahora cifrado)
//     const datatoSign = process.env.MERCANTIL_CLIENT_ID + JSON.stringify(payload);
//     const signature = crypto
//         .createHmac('sha256', key)
//         .update(datatoSign)
//         .digest('hex');

//     try {
//         const response = await axios.post(process.env.MERCANTIL_URL, payload, {
//             headers: {
//                 'X-IBM-Client-Id': process.env.MERCANTIL_CLIENT_ID,
//                 'X-Signature': signature,
//                 'Content-Type': 'application/json',
//                 'Accept': 'application/json'
//                 // Nota: La documentación de certificación a veces NO pide el Secret en el header
//             }
//         });

//         console.log("✅ ÉXITO EN CERTIFICACIÓN:", response.data);

//     } catch (error) {
//         console.error("❌ ERROR:", error.response?.status);
//         console.error("Detalle:", JSON.stringify(error.response?.data, null, 2));
//     }
// }

// testCertificacion();









