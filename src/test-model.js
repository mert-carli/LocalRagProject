// Foundry SDK'yı içeri aktar
// Not: foundry-local-sdk kütüphanesinin tam API'si dokümantasyonuna göre değişiklik gösterebilir.
// Aşağıdaki kod, standart bir LLM istemcisi mantığına göre tasarlanmıştır.

const { Foundry } = require('foundry-local-sdk');

async function testModel() {
    try {
        console.log("Foundry başlatılıyor...");
        
        // İstemciyi oluştur
        const foundry = new Foundry(); 
        
        console.log("Phi modeli kullanılarak soru gönderiliyor...");
        
        // Soru
        const question = "Merhaba kendini tanıt";
        console.log(`Soru: ${question}`);
        
        // Modele istek at
        const response = await foundry.chat({
            model: "phi", 
            messages: [
                { role: "user", content: question }
            ]
        });

        console.log("\n--- AI CEVABI ---");
        // Dönüş formatı SDK'ya göre değişebilir, genel bir format varsayıldı
        console.log(response.message || response.content || response);
        console.log("-----------------\n");

    } catch (error) {
        console.error("Yapay zeka çalıştırılırken bir hata oluştu:", error.message);
    }
}

testModel();
