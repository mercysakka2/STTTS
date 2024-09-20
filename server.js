const express = require('express');
const { MsEdgeTTS, OUTPUT_FORMAT, VOICE_LIST } = require('msedge-tts');
const xmlescape = require('xml-escape');
const bodyParser = require('body-parser');

const app = express();
app.use(express.static('public'));
app.use(bodyParser.json());

// Konfigurasi
const config = {
    defaultVoice: 'id-ID-ArdiNeural',
    fallbackVoices: ['id-ID-GadisNeural', 'en-US-ChristopherNeural'],
    port: process.env.PORT || 3000,
    outputFormat: OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
};

// Fungsi logging
const log = (message, data = {}) => {
    console.log(`[${new Date().toISOString()}] ${message}`, JSON.stringify(data, null, 2));
};

// Inisialisasi TTS
const initTTS = async (voice) => {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, config.outputFormat);
    return tts;
};

// Fungsi untuk menghasilkan audio
const generateAudio = async (text, voice, settings) => {
    const tts = await initTTS(voice);
    
    return new Promise((resolve, reject) => {
        const escapedText = xmlescape(text);
        const readable = tts.toStream(escapedText, {
            pitch: settings.pitch || '+0Hz',
            rate: settings.rate || '+0%',
            volume: settings.volume || '+0%',
        });

        let data64 = '';

        readable.on('data', (chunk) => {
            data64 += chunk.toString('base64');
        });

        readable.on('end', () => {
            const audioUrl = `data:audio/mpeg;base64,${data64}`;
            resolve(audioUrl);
        });

        readable.on('error', reject);
    });
};

// Route untuk generate audio
app.post('/generate-audio', async (req, res) => {
    const { text, voice = config.defaultVoice, settings = {} } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Teks diperlukan' });
    }

    log('Received TTS request', { text, voice, settings });

    const voices = [voice, ...config.fallbackVoices];

    for (const currentVoice of voices) {
        try {
            const audioUrl = await generateAudio(text, currentVoice, settings);
            log('Audio generated successfully', { voice: currentVoice });
            return res.json({ audioUrl, usedVoice: currentVoice });
        } catch (err) {
            log('Error generating audio', { voice: currentVoice, error: err.message });
        }
    }

    res.status(500).json({ error: 'Gagal menghasilkan audio dengan semua suara yang tersedia' });
});

// Route untuk mendapatkan daftar suara
app.get('/available-voices', async (req, res) => {
    try {
        const allVoices = await VOICE_LIST();
        const indonesianVoices = allVoices.filter(voice => voice.Locale.startsWith('id-'));
        log('Retrieved available Indonesian voices', { count: indonesianVoices.length });
        res.json({ voices: indonesianVoices });
    } catch (err) {
        log('Error retrieving voices', { error: err.message });
        res.status(500).json({ error: 'Gagal mengambil daftar suara' });
    }
});

// Health check route
app.get('/health', (req, res) => {
    log('Health check requested');
    res.json({ 
        status: 'OK', 
        defaultVoice: config.defaultVoice,
        fallbackVoices: config.fallbackVoices
    });
});

// Mulai server
app.listen(config.port, () => {
    log(`Server berjalan di port ${config.port}`);
});