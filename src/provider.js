const path = require('path');
const fs = require('fs');

let foundryManager = null;
let isFoundryReady = false;

// Foundry Local SDK'yı güvenli bir şekilde ilklendirmeyi dene
async function initFoundry() {
    try {
        const { FoundryLocalManager } = await import('foundry-local-sdk');
        
        // Native DLL dizinini kontrol et
        const platformKey = `${process.platform}-${process.arch}`;
        const possibleCorePath = path.join(__dirname, '../node_modules/foundry-local-sdk/prebuilds', platformKey, 'foundry_local_napi.node');
        
        if (fs.existsSync(possibleCorePath)) {
            foundryManager = FoundryLocalManager.create({
                appName: 'LocalRAGAssistant',
                logLevel: 'info',
                libraryPath: possibleCorePath
            });
            isFoundryReady = true;
            console.log("[Foundry Local SDK] Yerel AI motoru başarıyla aktif edildi.");
        }
    } catch (err) {
        // Native DLL eksikse sessizce logla (Ollama ve RAG Simülasyonu devrede kalır)
        console.log("[Foundry Local SDK] Yerel C++ runtime bekleniyor. (Ollama modunda çalışılacak)");
    }
}

// Uygulama başlarken ilklendir
initFoundry();

module.exports = {
    isFoundryAvailable: () => isFoundryReady,
    getFoundryManager: () => foundryManager
};
