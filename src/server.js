const express = require('express');
const os = require('os');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { generateRagContext } = require('./rag');
const { databaseReady, getKnowledgeBaseStatus, indexDocument, synchronizeDocuments } = require('./vectorStore');
const { systemPrompt } = require('./prompts');

const app = express();
const port = 3000;
const docsDir = path.join(__dirname, '../docs');
let previousCpuSample = os.cpus();

function getCpuUsagePercent() {
    const currentCpuSample = os.cpus();
    let idleDelta = 0;
    let totalDelta = 0;

    currentCpuSample.forEach((cpu, index) => {
        const previous = previousCpuSample[index];
        const currentTotal = Object.values(cpu.times).reduce((total, time) => total + time, 0);
        const previousTotal = Object.values(previous.times).reduce((total, time) => total + time, 0);
        idleDelta += cpu.times.idle - previous.times.idle;
        totalDelta += currentTotal - previousTotal;
    });

    previousCpuSample = currentCpuSample;
    return totalDelta ? Math.round(((totalDelta - idleDelta) / totalDelta) * 100) : 0;
}

fs.mkdirSync(docsDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: docsDir,
        filename: (req, file, callback) => {
            const safeName = path.basename(file.originalname)
                .replace(/[^\p{L}\p{N}._ -]/gu, '_');
            callback(null, safeName);
        }
    }),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLocaleLowerCase('tr-TR');
        callback(null, extension === '.pdf' || extension === '.md');
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/knowledge-base', async (req, res) => {
    await synchronizeDocuments();
    res.json({ ready: true, ...getKnowledgeBaseStatus() });
});

app.get('/system-status', async (req, res) => {
    const totalMemoryGb = os.totalmem() / (1024 ** 3);
    const usedMemoryGb = totalMemoryGb - os.freemem() / (1024 ** 3);
    const systemMetrics = {
        cpuUsagePercent: getCpuUsagePercent(),
        memoryUsedGb: Number(usedMemoryGb.toFixed(1))
    };

    try {
        const response = await fetch('http://localhost:11434/api/tags', {
            signal: AbortSignal.timeout(1500)
        });
        const data = response.ok ? await response.json() : { models: [] };
        res.json({
            modelOnline: response.ok,
            models: data.models?.map(model => model.name.replace(/:.+$/, '')).slice(0, 3) || [],
            ...systemMetrics
        });
    } catch (error) {
        res.json({ modelOnline: false, models: [], ...systemMetrics });
    }
});

app.post('/upload-document', upload.single('document'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'PDF veya Markdown belgesi seçin.' });
    }

    try {
        const chunks = await indexDocument(req.file.filename);
        res.status(201).json({
            message: `${req.file.originalname} indekslendi.`,
            chunks,
            ...getKnowledgeBaseStatus()
        });
    } catch (error) {
        fs.unlink(req.file.path, () => {});
        res.status(422).json({ error: error.message });
    }
});

app.post('/reindex-document', async (req, res) => {
    const fileName = path.basename(req.body?.fileName || '');
    const extension = path.extname(fileName).toLocaleLowerCase('tr-TR');

    if (!fileName || !['.pdf', '.md'].includes(extension) || !fs.existsSync(path.join(docsDir, fileName))) {
        return res.status(400).json({ error: 'Geçerli bir belge bulunamadı.' });
    }

    try {
        const chunks = await indexDocument(fileName);
        res.json({ message: `${fileName} yeniden indekslendi.`, chunks, ...getKnowledgeBaseStatus() });
    } catch (error) {
        res.status(422).json({ error: error.message });
    }
});

// Canlı Akışlı (Streaming / SSE) Yanıt Endpoint'i (Hızlı Yanıt İçin)
app.post('/chat-stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let context = "";
    try {
        const { message, model, deepSearch = false, reasoning = false, fast = true } = req.body;
        const selectedModel = model || 'mistral';
        console.log(`[Stream] Kullanıcı Sorusu: "${message}" (Model: ${selectedModel})`);

        context = generateRagContext(message, { deepSearch });
        const responseInstructions = [
            deepSearch ? 'Sağlanan kaynakları ayrıntılı biçimde karşılaştır ve ilgili noktaları kapsa.' : '',
            reasoning ? 'Sonuca varmadan önce bilgileri dikkatle değerlendir; yanıtı açık bir gerekçeyle yapılandır.' : '',
            fast ? 'Gereksiz ayrıntıya girmeden öz ve doğrudan yanıt ver.' : ''
        ].filter(Boolean).join(' ');
        const generationOptions = {
            num_ctx: deepSearch ? 8192 : 4096,
            num_predict: fast ? 1024 : reasoning ? 2048 : 1536,
            temperature: reasoning ? 0.2 : 0.3
        };
        const finalPrompt = `${systemPrompt}\n\n${context}\n\n${responseInstructions}\n\nSoru: ${message}\n\nCevap (Türkçe):`;

        res.write(`data: ${JSON.stringify({ type: 'context', context: context })}\n\n`);

        let response;
        try {
            response = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: selectedModel,
                    prompt: finalPrompt,
                    stream: true,
                    keep_alive: "60m",
                    options: generationOptions
                })
            });
        } catch (e) {
            // Fallback to llama3 if selectedModel fails
            response = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'llama3:latest',
                    prompt: finalPrompt,
                    stream: true,
                    keep_alive: "60m",
                    options: generationOptions
                })
            });
        }

        if (!response || !response.ok || !response.body) {
            throw new Error(`Ollama API yanıt vermedi.`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.response) {
                        res.write(`data: ${JSON.stringify({ type: 'token', token: parsed.response })}\n\n`);
                    }
                } catch (err) {
                    // Incomplete chunk
                }
            }
        }
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
    } catch (error) {
        console.error("[Stream] Hata:", error.message);
        const simulatedText = "**Local-RAG-Assistant [Çevrimdışı Simülasyon Modu]**\n\n" +
            "*(Sistem Notu: Yerel Ollama servisi arka planda erişilemiyor. Belgelerden çıkarılan bağlam aşağıdadır:)*\n\n" + context;
        
        res.write(`data: ${JSON.stringify({ type: 'token', token: simulatedText })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
    }
});

// Standart (Non-stream) Chat Endpoint'i
app.post('/chat', async (req, res) => {
    let context = "";
    try {
        const { message } = req.body;
        context = generateRagContext(message);
        const finalPrompt = `${systemPrompt}\n\n${context}\n\nSoru: ${message}\n\nCevap (Türkçe):`;
        
        let response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'mistral',
                prompt: finalPrompt,
                stream: false,
                keep_alive: "60m"
            })
        });

        if (!response || !response.ok) throw new Error("Ollama API yanıt vermedi.");
        const data = await response.json();
        res.json({ reply: data.response, context: context });
    } catch (error) {
        const simulatedResponse = "**Local-RAG-Assistant [Çevrimdışı Simülasyon Modu]**\n\n" +
            "*(Yerel Ollama servisine erişilemiyor.)*\n\n" + context;
        res.json({ reply: simulatedResponse, context: context, isSimulated: true });
    }
});

async function startServer() {
    try {
        await databaseReady;
        app.listen(port, '0.0.0.0', () => {
            const localAddresses = Object.values(os.networkInterfaces())
                .flat()
                .filter(network => network.family === 'IPv4' && !network.internal)
                .map(network => `http://${network.address}:${port}`);

            console.log("=" .repeat(60));
            console.log("Local-RAG-Assistant %100 Çevrimdışı Web Sunucusu Başlatıldı");
            console.log(`Arayüz Adresi: http://localhost:${port}`);
            if (localAddresses.length > 0) {
                console.log(`Yerel Ağ Adresi: ${localAddresses.join(', ')}`);
            }
            console.log("=" .repeat(60));
            
            // Sunucu tam hazır olduğunda tarayıcıyı otomatik aç
            if (os.platform() === 'win32') {
                require('child_process').exec(`start http://localhost:${port}`);
            } else if (os.platform() === 'darwin') {
                require('child_process').exec(`open http://localhost:${port}`);
            } else {
                require('child_process').exec(`xdg-open http://localhost:${port}`);
            }
        });
    } catch (error) {
        console.error("Belge indeksi hazırlanamadığı için sunucu başlatılamadı:", error.message);
        process.exitCode = 1;
    }
}

startServer();
