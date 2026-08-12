const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// SQLite veritabanı bağlantısı
const dbPath = path.join(__dirname, '../database/rag.db');
const db = new Database(dbPath);
const docsDir = path.join(__dirname, '../docs');

// Tablo oluştur
db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        tokens TEXT
    )
`);

// Türkçe Etkisiz Kelimeler (Stopwords) Listesi
const TURKISH_STOPWORDS = new Set([
    've', 'veya', 'de', 'da', 'ki', 'ile', 'için', 'gibi', 'göre', 'kadar',
    'nin', 'nın', 'nun', 'nün', 'in', 'ın', 'un', 'ün',
    'den', 'dan', 'ten', 'tan', 'ne', 'nedir', 'neden', 'nasıl', 'nerede', 'neresidir', 'hangisi',
    'bu', 'şu', 'o', 'bir', 'her', 'tüm', 'bütün', 'olan', 'olarak', 'var', 'yok', 'ile'
]);

// Türkçe karakter destekli metin parçalama (Tokenization)
function tokenize(text) {
    return text.toLocaleLowerCase('tr-TR').match(/[\p{L}0-9_]+/gu) || [];
}

// Belgeyi veritabanına ekle
function insertDocument(title, content) {
    const tokens = tokenize(content).join(',');
    const stmt = db.prepare('INSERT INTO documents (title, content, tokens) VALUES (?, ?, ?)');
    stmt.run(title, content, tokens);
}

// Gelişmiş Türkçe Arama (Stopwords Ayıklama + Kök & Ek Duyarlı Eşleştirme)
function searchDocuments(query, limit = 6) {
    const rawTokens = tokenize(query);
    const queryTokens = rawTokens.filter(t => t.length >= 3 && !TURKISH_STOPWORDS.has(t));
    
    // Anlamlı anahtar kelime yoksa eşleşme arama
    if (queryTokens.length === 0) {
        return [];
    }

    // 1. SQLite Ön Filtreleme: Yalnızca arama kelimelerini veya köklerini içeren metinleri getir
    const conditions = [];
    const params = [];
    for (const qt of queryTokens) {
        const prefix = qt.substring(0, Math.min(4, qt.length));
        if (prefix.length >= 3) {
            conditions.push(`tokens LIKE ?`);
            params.push(`%${prefix}%`);
        }
    }

    if (conditions.length === 0) return [];
    
    const sql = `SELECT * FROM documents WHERE ${conditions.join(' OR ')}`;
    const rows = db.prepare(sql).all(...params);
    
    // 2. Hafızada Detaylı Puanlama (Artık tüm tabloyu değil, sadece ön filtreden geçen satırları tarıyoruz)
    const results = rows.map(row => {
        const docText = row.content.toLocaleLowerCase('tr-TR');
        const docTokens = row.tokens.split(',');
        let score = 0;
        
        for (const qt of queryTokens) {
            const prefix = qt.substring(0, Math.min(4, qt.length));
            
            // 1. Tam kelime eşleşmesi (4 Puan)
            if (docTokens.includes(qt)) {
                score += 4;
            }
            // 2. Metin içi doğrudan alt dize eşleşmesi (3 Puan)
            else if (docText.includes(qt)) {
                score += 3;
            }
            // 3. Türkçe kök / önek eşleşmesi (2 Puan)
            else if (qt.length >= 4 && prefix.length >= 3 && (docText.includes(prefix) || docTokens.some(dt => dt.startsWith(prefix)))) {
                score += 2;
            }
        }
        return { ...row, score };
    });
    
    results.sort((a, b) => b.score - a.score);
    // En az 2 puan alan en alakalı parçaları döndür
    return results.filter(r => r.score >= 2).slice(0, limit);
}

function getKnowledgeBaseStatus() {
    const documents = db.prepare(`
        SELECT title, COUNT(*) AS chunks
        FROM documents
        GROUP BY title
        ORDER BY title COLLATE NOCASE
    `).all().map(document => {
        const filePath = path.join(docsDir, document.title);
        const sizeBytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
        return { ...document, sizeBytes };
    });

    return {
        documentCount: documents.length,
        chunkCount: documents.reduce((total, document) => total + document.chunks, 0),
        totalSizeBytes: documents.reduce((total, document) => total + document.sizeBytes, 0),
        documents
    };
}

async function indexDocument(file, replaceExisting = true) {
    const filePath = path.join(docsDir, file);
    const extension = path.extname(file).toLocaleLowerCase('tr-TR');

    if (replaceExisting) {
        db.prepare('DELETE FROM documents WHERE title = ?').run(file);
    }

    let chunks;
    if (extension === '.md') {
        chunks = chunkText(fs.readFileSync(filePath, 'utf-8'));
    } else if (extension === '.pdf') {
        const data = await pdfParse(fs.readFileSync(filePath));
        chunks = chunkText(data.text);
    } else {
        throw new Error('Yalnızca PDF ve Markdown belgeleri desteklenir.');
    }

    if (chunks.length === 0) {
        throw new Error('Belgeden indekslenebilir metin çıkarılamadı.');
    }

    for (const chunk of chunks) insertDocument(file, chunk);
    console.log(`[+] ${file} - ${chunks.length} parça indekslendi.`);
    return chunks.length;
}

// Metni mantıklı parçalara (chunk) bölen esnek fonksiyon
function chunkText(text, maxLen = 600) {
    if (!text || text.trim().length === 0) return [];
    
    const cleanText = text.replace(/\r/g, '').trim();
    const sentences = cleanText.split(/(?<=[.?!])\s+|\n\n+/);
    const chunks = [];
    let currentChunk = "";
    
    for (const sentence of sentences) {
        if ((currentChunk.length + sentence.length) > maxLen && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += " " + sentence;
        }
    }
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }

    if (chunks.length === 0 && cleanText.length > 0) {
        for (let i = 0; i < cleanText.length; i += maxLen) {
            chunks.push(cleanText.substring(i, i + maxLen));
        }
    }
    return chunks;
}

// Belgeleri docs klasörüyle senkronize et ve henüz eklenmemiş olanları indeksle.
async function synchronizeDocuments(logProgress = false) {
    if (logProgress) console.log("Belgeler (MD ve PDF) kontrol ediliyor ve indeksleniyor...");
    if (fs.existsSync(docsDir)) {
        const files = fs.readdirSync(docsDir).filter(file => {
            const extension = path.extname(file).toLocaleLowerCase('tr-TR');
            return extension === '.md' || extension === '.pdf';
        });
        const deleteMissingDocuments = db.prepare('DELETE FROM documents WHERE title = ?');
        const indexedTitles = db.prepare('SELECT DISTINCT title FROM documents').all();

        for (const { title } of indexedTitles) {
            if (!files.includes(title)) {
                deleteMissingDocuments.run(title);
                console.log(`[-] ${title} kaynağı bulunamadığı için indeksten kaldırıldı.`);
            }
        }

        for (const file of files) {
            const filePath = path.join(docsDir, file);
            
            const existing = db.prepare('SELECT id FROM documents WHERE title = ?').get(file);
            if (existing) continue;
            
            try {
                await indexDocument(file, false);
            } catch (err) {
                console.error(`[-] ${file} okunurken hata oluştu:`, err.message);
            }
        }
    }
    if (logProgress) console.log("Veritabanı indeksi güncel. Sistem hazır.");
}

const databaseReady = synchronizeDocuments(true);

module.exports = { searchDocuments, getKnowledgeBaseStatus, indexDocument, synchronizeDocuments, databaseReady };
