const { searchDocuments } = require('./vectorStore');

function generateRagContext(query, { deepSearch = false } = {}) {
    // 1. Sorguya göre en uygun belgeleri SQLite (vectorStore) içinden getir
    const relevantDocs = searchDocuments(query, deepSearch ? 10 : 6);
    
    if (relevantDocs.length === 0) {
        return "Sorguyla ilgili veritabanında henüz kaynak belge bulunamadı.";
    }
    
    // 2. Bulunan belgeleri yapay zekanın anlayacağı Türkçe metin formatına dönüştür
    let context = "Aşağıdaki belge bağlamını esas alarak sorulan soruyu açıklayıcı ve net bir Türkçe ile cevapla. Dikkat: Belge sonundaki Kaynakça/Bibliyografya listelerinde geçen yayın adlarını belgenin içerik bilgisi gibi aktarma, metnin kendisindeki açıklamaları kullan.\n\n---\n";
    relevantDocs.forEach((doc, index) => {
        context += `[Kaynak Belge ${index + 1}: ${doc.title}]\n${doc.content}\n\n`;
    });
    context += "---\n";
    
    return context;
}

module.exports = { generateRagContext };
