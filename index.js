const nodeCrypto = require('crypto');
if (!globalThis.crypto) {
  globalThis.crypto = nodeCrypto.webcrypto;
}

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const express = require('express');
const axios = require('axios');

const app = express();

const PORT = process.env.PORT || 3000;
const AUTH_DIR = process.env.AUTH_DIR || './auth';

const BRAND_NAME = process.env.BRAND_NAME || 'Asisten AI Dr. Danang Baskoro, Psikolog';
const BOT_NAME = process.env.BOT_NAME || `${BRAND_NAME}`;
const ADMIN_CONTACT = process.env.ADMIN_CONTACT || '-';

const AI_ENDPOINT = process.env.AI_ENDPOINT || 'https://mute-leaf-0298.digifarmteknesiamandiri.workers.dev/chat';
const AI_TOKEN = process.env.AI_TOKEN || '123123';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || '';
const YOUTUBE_CHANNEL_URL =
  process.env.YOUTUBE_CHANNEL_URL || 'https://www.youtube.com/@DanangBaskoroPsikolog';

let qrCodeString = null;
let isConnected = false;
let startTime = Date.now();
let activeSocket = null;

const recentMessages = new Map();
const conversationMemory = new Map();

const MAX_HISTORY = 8;
const DUPLICATE_WINDOW_MS = 2000;
const MEMORY_TTL_MS = 1000 * 60 * 30;

const STATIC_RESPONSES = {
  menu: [
    `📋 *Menu Bantuan ${BOT_NAME}*`,
    '',
    'Silakan pilih topik yang ingin ditanyakan:',
    '• *tentang* → info media pembelajaran',
    '• *video* → rekomendasi video pembelajaran',
    '• *topik* → daftar topik psikologi',
    '• *trauma* → materi seputar trauma psikologis',
    '• *healing* → materi self healing & pemulihan diri',
    '• *depresi* → materi depresi & kesehatan mental',
    '• *cemas* → materi kecemasan & overthinking',
    '• *remaja* → materi remaja, parenting, dan pengembangan diri',
    '• *channel* → link channel YouTube resmi',
    '• *admin* → hubungi admin / pihak resmi',
    '• *ketentuan* → ketentuan penggunaan layanan',
    '',
    'Atau kakak bisa langsung tulis topik yang ingin dipelajari ya 😊'
  ].join('\n'),

  tentang: [
    `🧠 *Tentang ${BOT_NAME}*`,
    '',
    `${BOT_NAME} adalah media pembelajaran psikologi bersama Dr. Danang Baskoro, Psikolog.`,
    'Kami membantu kakak menemukan materi edukatif berupa video, pembahasan topik psikologi, dan arahan belajar yang relevan.',
    '',
    'Fokus kami adalah pembelajaran dan edukasi psikologi, bukan diagnosis atau layanan penanganan klinis langsung.'
  ].join('\n'),

  channel: [
    '🎥 *Channel YouTube Resmi*',
    '',
    'Kakak bisa mengakses media pembelajaran psikologi Dr. Danang Baskoro, Psikolog melalui channel resmi berikut:',
    `• ${YOUTUBE_CHANNEL_URL}`,
    '',
    'Di channel tersebut tersedia ratusan video pembelajaran dengan berbagai topik psikologi.'
  ].join('\n'),

  video: [
    '🎬 *Rekomendasi Akses Video*',
    '',
    'Untuk memudahkan belajar, kakak bisa langsung buka channel resmi Dr. Danang Baskoro, Psikolog:',
    `• ${YOUTUBE_CHANNEL_URL}`,
    '',
    'Lalu cari topik sesuai kebutuhan, misalnya: trauma, self healing, depresi, kecemasan, relasi, parenting, atau remaja.'
  ].join('\n'),

  topik: [
    '📚 *Topik Pembelajaran Psikologi*',
    '',
    'Beberapa topik yang bisa kakak pelajari:',
    '• trauma psikologis',
    '• self healing',
    '• depresi dan kecemasan',
    '• overthinking dan emosi',
    '• relasi dan kehidupan pribadi',
    '• parenting dan remaja',
    '• pengembangan diri',
    '',
    'Silakan ketik topik yang ingin kakak cari ya.'
  ].join('\n'),

  trauma: [
    '🧩 *Materi Trauma Psikologis*',
    '',
    'Untuk materi trauma psikologis, kakak bisa mulai dari channel resmi Dr. Danang Baskoro, Psikolog:',
    `• ${YOUTUBE_CHANNEL_URL}`,
    '',
    'Silakan gunakan kata kunci seperti: trauma, luka batin, masa kecil, atau pemulihan emosi.'
  ].join('\n'),

  healing: [
    '🌿 *Materi Self Healing*',
    '',
    'Untuk pembelajaran tentang self healing dan pemulihan diri, kakak bisa cek channel resmi berikut:',
    `• ${YOUTUBE_CHANNEL_URL}`,
    '',
    'Coba cari dengan kata kunci: self healing, pemulihan diri, emosi, atau proses bertumbuh.'
  ].join('\n'),

  depresi: [
    '💙 *Materi Depresi & Kesehatan Mental*',
    '',
    'Kakak bisa menemukan materi pembelajaran terkait depresi dan kesehatan mental di channel resmi:',
    `• ${YOUTUBE_CHANNEL_URL}`,
    '',
    'Silakan cari menggunakan kata kunci: depresi, kecemasan, stres, atau kesehatan mental.'
  ].join('\n'),

  cemas: [
    '💭 *Materi Kecemasan & Overthinking*',
    '',
    'Untuk topik kecemasan, pikiran berlebihan, dan ketegangan emosi, kakak bisa cek channel resmi berikut:',
    `• ${YOUTUBE_CHANNEL_URL}`,
    '',
    'Coba gunakan kata kunci: cemas, overthinking, takut, khawatir, atau emosi.'
  ].join('\n'),

  remaja: [
    '👨‍👩‍👧 *Materi Remaja, Parenting, dan Pengembangan Diri*',
    '',
    'Untuk topik remaja, parenting, dan pengembangan diri, kakak bisa belajar melalui channel resmi berikut:',
    `• ${YOUTUBE_CHANNEL_URL}`,
    '',
    'Silakan telusuri video sesuai kebutuhan pembelajaran kakak.'
  ].join('\n'),

  admin: [
    '👨‍💼 *Kontak Admin / Pihak Resmi*',
    '',
    `Silakan hubungi admin di: ${ADMIN_CONTACT}`,
    '',
    'Agar dibantu lebih cepat, mohon sertakan:',
    '• topik yang ingin dicari',
    '• kendala yang dialami',
    '• link atau materi yang sedang dicari',
    '• pertanyaan yang ingin ditanyakan'
  ].join('\n'),

  status: () => [
    `🤖 *Status ${BOT_NAME}*`,
    '',
    `• Koneksi WhatsApp: ${isConnected ? 'terhubung' : 'belum terhubung'}`,
    `• Uptime: ${getUptime()}`,
    `• Admin: ${ADMIN_CONTACT}`,
    `• YouTube API: ${YOUTUBE_API_KEY && YOUTUBE_CHANNEL_ID ? 'aktif' : 'belum diset'}`,
    '',
    'Bot aktif dan siap membantu pencarian media pembelajaran psikologi.'
  ].join('\n'),

  ketentuan: () => buildTermsText()
};

function buildTermsText() {
  return [
    `📜 *Ketentuan Penggunaan ${BRAND_NAME}*`,
    '',
    '*1. Umum*',
    'Dengan menggunakan layanan ini, pengguna dianggap telah membaca, memahami, dan menyetujui ketentuan yang berlaku.',
    '',
    '*2. Fokus Layanan*',
    `${BRAND_NAME} merupakan media pembelajaran psikologi bersama Dr. Danang Baskoro, Psikolog. Layanan ini ditujukan untuk edukasi, referensi materi, dan arahan pembelajaran psikologi.`,
    '',
    '*3. Batasan Layanan*',
    'Informasi yang diberikan bersifat edukatif dan tidak menggantikan diagnosis, asesmen, konseling, psikoterapi, atau penanganan profesional secara langsung.',
    '',
    '*4. Tanggung Jawab Pengguna*',
    'Pengguna bertanggung jawab untuk menggunakan materi pembelajaran secara bijak sesuai kebutuhan masing-masing.',
    '',
    '*5. Bantuan Lanjutan*',
    'Jika membutuhkan bantuan lebih lanjut yang bersifat personal atau profesional, pengguna disarankan menghubungi admin atau pihak resmi yang tersedia.',
    '',
    '*6. Sumber Konten*',
    'Materi pembelajaran dapat berupa video YouTube, webinar, dan konten edukasi psikologi lainnya dari Dr. Danang Baskoro, Psikolog.',
    '',
    '*7. Privasi*',
    'Data pengguna hanya digunakan untuk keperluan operasional layanan dan tidak dibagikan kepada pihak lain, kecuali bila diwajibkan oleh hukum.'
  ].join('\n');
}

function normalizeText(text = '') {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getUptime() {
  const total = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}j ${minutes}m ${seconds}d`;
}

function pruneMemory() {
  const now = Date.now();
  for (const [jid, memory] of conversationMemory.entries()) {
    if (!memory?.updatedAt || now - memory.updatedAt > MEMORY_TTL_MS) {
      conversationMemory.delete(jid);
    }
  }
}

function getConversation(jid) {
  pruneMemory();
  if (!conversationMemory.has(jid)) {
    conversationMemory.set(jid, {
      messages: [],
      updatedAt: Date.now()
    });
  }
  return conversationMemory.get(jid);
}

function pushConversation(jid, role, text) {
  const memory = getConversation(jid);
  memory.messages.push({ role, text });
  if (memory.messages.length > MAX_HISTORY) {
    memory.messages.splice(0, memory.messages.length - MAX_HISTORY);
  }
  memory.updatedAt = Date.now();
}

function detectQuickReply(text) {
  const normalized = normalizeText(text);

  if (['menu', 'help', 'bantuan'].includes(normalized)) return STATIC_RESPONSES.menu;
  if (['tentang', 'info', 'informasi'].includes(normalized)) return STATIC_RESPONSES.tentang;
  if (['channel', 'youtube', 'kanal'].includes(normalized)) return STATIC_RESPONSES.channel;
  if (['video'].includes(normalized)) return STATIC_RESPONSES.video;
  if (['topik', 'materi', 'kategori'].includes(normalized)) return STATIC_RESPONSES.topik;
  if (['trauma'].includes(normalized)) return STATIC_RESPONSES.trauma;
  if (['healing', 'self healing'].includes(normalized)) return STATIC_RESPONSES.healing;
  if (['depresi', 'mental health', 'kesehatan mental'].includes(normalized)) return STATIC_RESPONSES.depresi;
  if (['cemas', 'kecemasan', 'overthinking'].includes(normalized)) return STATIC_RESPONSES.cemas;
  if (['remaja', 'parenting'].includes(normalized)) return STATIC_RESPONSES.remaja;
  if (['admin', 'cs', 'kontak admin'].includes(normalized)) return STATIC_RESPONSES.admin;
  if (['status', 'status bot', 'cek bot'].includes(normalized)) {
    return typeof STATIC_RESPONSES.status === 'function'
      ? STATIC_RESPONSES.status()
      : STATIC_RESPONSES.status;
  }
  if (['tos', 'syarat', 'ketentuan', 'terms'].includes(normalized)) {
    return typeof STATIC_RESPONSES.ketentuan === 'function'
      ? STATIC_RESPONSES.ketentuan()
      : STATIC_RESPONSES.ketentuan;
  }

  return null;
}

function extractIncomingText(message = {}) {
  const m = message.message || {};
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.buttonsResponseMessage?.selectedDisplayText) return m.buttonsResponseMessage.selectedDisplayText;
  if (m.templateButtonReplyMessage?.selectedDisplayText) return m.templateButtonReplyMessage.selectedDisplayText;
  if (m.listResponseMessage?.title) return m.listResponseMessage.title;
  return '';
}

function buildAiHistory(jid) {
  const memory = getConversation(jid);
  return memory.messages.map((item) => ({
    role: item.role,
    content: item.text
  }));
}

function detectTopic(text = '') {
  const msg = normalizeText(text);

  const topicMap = [
    {
      topic: 'trauma',
      keywords: ['trauma', 'luka batin', 'inner child', 'masa kecil', 'pemulihan emosi']
    },
    {
      topic: 'self healing',
      keywords: ['self healing', 'healing', 'pemulihan diri', 'bertumbuh', 'menyembuhkan diri']
    },
    {
      topic: 'depresi',
      keywords: ['depresi', 'stres berat', 'murung', 'putus asa']
    },
    {
      topic: 'kecemasan',
      keywords: ['cemas', 'kecemasan', 'overthinking', 'takut', 'khawatir', 'panic', 'panik']
    },
    {
      topic: 'remaja',
      keywords: ['remaja', 'anak', 'parenting', 'orang tua', 'pola asuh']
    },
    {
      topic: 'relasi',
      keywords: ['relasi', 'hubungan', 'pasangan', 'pernikahan', 'komunikasi']
    },
    {
      topic: 'pengembangan diri',
      keywords: ['pengembangan diri', 'motivasi', 'mindset', 'percaya diri', 'bertumbuh']
    }
  ];

  for (const item of topicMap) {
    if (item.keywords.some((keyword) => msg.includes(keyword))) {
      return item.topic;
    }
  }

  return null;
}

async function searchYoutubeVideosByTopic(topic, maxResults = 5) {
  if (!YOUTUBE_API_KEY || !YOUTUBE_CHANNEL_ID) {
    return [];
  }

  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      timeout: 20000,
      params: {
        key: YOUTUBE_API_KEY,
        part: 'snippet',
        channelId: YOUTUBE_CHANNEL_ID,
        q: topic,
        type: 'video',
        order: 'relevance',
        maxResults
      }
    });

    const items = response.data?.items || [];

    return items.map((item) => ({
      videoId: item.id?.videoId || '',
      title: item.snippet?.title || 'Video tanpa judul',
      description: item.snippet?.description || '',
      publishedAt: item.snippet?.publishedAt || '',
      thumbnail: item.snippet?.thumbnails?.medium?.url || '',
      url: item.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : ''
    })).filter((item) => item.videoId && item.url);
  } catch (error) {
    console.error('YouTube API error:', error.response?.data || error.message);
    return [];
  }
}

function buildYoutubeRecommendationText(topic, videos = []) {
  if (!videos.length) {
    return [
      `Maaf kak, saya belum menemukan video yang cocok untuk topik *${topic}*.`,
      '',
      'Kakak bisa coba gunakan kata kunci yang lebih spesifik seperti:',
      '• trauma',
      '• self healing',
      '• depresi',
      '• kecemasan',
      '• remaja',
      '• parenting',
      '',
      `Atau langsung buka channel resmi berikut ya:`,
      `${YOUTUBE_CHANNEL_URL}`
    ].join('\n');
  }

  const lines = [
    `Berikut rekomendasi video untuk topik *${topic}* ya kak 😊`,
    ''
  ];

  videos.slice(0, 5).forEach((video, index) => {
    lines.push(`${index + 1}. *${video.title}*`);
    lines.push(video.url);
    lines.push('');
  });

  lines.push('Kalau kak mau, saya juga bisa carikan topik lain yang lebih spesifik.');
  return lines.join('\n');
}

async function askAI(jid, userText) {
  if (!AI_ENDPOINT || !AI_TOKEN) {
    return `Maaf kak, fitur AI belum aktif. Silakan hubungi admin di ${ADMIN_CONTACT} ya 🙏`;
  }

  try {
    const history = buildAiHistory(jid);

    const response = await axios.post(
      AI_ENDPOINT,
      {
        message: userText,
        history
      },
      {
        timeout: 30000,
        headers: {
          Authorization: `Bearer ${AI_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = String(response.data?.reply || '').trim();

    if (!reply) {
      return `Maaf kak, saya belum bisa jawab itu sekarang. Silakan hubungi admin di ${ADMIN_CONTACT} ya 🙏`;
    }

    return reply;
  } catch (error) {
    const detail = error.response?.data || error.message;
    console.error('AI endpoint error:', detail);
    return `Maaf kak, sistem sedang gangguan. Silakan coba lagi sebentar atau hubungi admin di ${ADMIN_CONTACT} ya 🙏`;
  }
}

async function sendMainMenu(sock, jid) {
  const text = [
    `Halo kak 👋 Selamat datang di *${BOT_NAME}*`,
    '',
    `Ini adalah media pembelajaran psikologi bersama *Dr. Danang Baskoro, Psikolog*.`,
    '',
    'Kakak bisa belajar berbagai topik seperti trauma, self healing, depresi, kecemasan, relasi, dan pengembangan diri.',
    '',
    'Silakan pilih menu di bawah atau langsung ketik topik yang ingin dipelajari ya 😊'
  ].join('\n');

  try {
    await sock.sendMessage(jid, {
      text,
      footer: `${BRAND_NAME} • media pembelajaran psikologi`,
      buttons: [
        { buttonId: 'menu', buttonText: { displayText: 'Menu' }, type: 1 },
        { buttonId: 'video', buttonText: { displayText: 'Video' }, type: 1 },
        { buttonId: 'admin', buttonText: { displayText: 'Admin' }, type: 1 }
      ],
      headerType: 1
    });
  } catch (error) {
    console.warn('Gagal kirim tombol, fallback ke menu teks:', error?.message || error);
    await sock.sendMessage(jid, { text: STATIC_RESPONSES.menu });
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  let version;
  let isLatest = false;

  try {
    const latest = await fetchLatestBaileysVersion();
    version = latest.version;
    isLatest = latest.isLatest;
    console.log('Baileys WA version:', version.join('.'), 'isLatest:', isLatest);
  } catch (err) {
    console.error('Gagal mengambil versi WA terbaru, lanjut pakai default:', err?.message || err);
  }

  const sock = makeWASocket({
    auth: state,
    ...(version ? { version } : {})
  });

  activeSocket = sock;

  sock.ev.on('connection.update', (update) => {
    const { qr, connection, lastDisconnect } = update;

    console.log('connection.update:', {
      connection,
      hasQr: !!qr,
      statusCode: lastDisconnect?.error?.output?.statusCode,
      error: lastDisconnect?.error?.message
    });

    if (qr) {
      qrCodeString = qr;
      isConnected = false;
      console.log('\n═══════════════════════════════════════════');
      console.log(`📱 QR Code ${BOT_NAME}`);
      console.log('═══════════════════════════════════════════\n');
      qrcode.generate(qr, { small: true });
      console.log('\nScan QR dari WhatsApp > Perangkat tertaut > Tautkan perangkat\n');
    }

    if (connection === 'open') {
      isConnected = true;
      qrCodeString = null;
      console.log(`✅ ${BOT_NAME} terhubung dan siap digunakan.`);
    }

    if (connection === 'close') {
      isConnected = false;
      qrCodeString = null;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`⚠️ Koneksi terputus. Reconnect: ${shouldReconnect ? 'ya' : 'tidak'}`);
      if (shouldReconnect) {
        setTimeout(startBot, 5000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    let jid = null;

    try {
      const m = messages?.[0];
      if (!m?.message || m.key.fromMe) return;

      jid = m.key.remoteJid;
      const messageText = extractIncomingText(m);
      if (!messageText) return;

      const normalized = normalizeText(messageText);
      const last = recentMessages.get(jid);
      if (last && last.text === normalized && Date.now() - last.time < DUPLICATE_WINDOW_MS) {
        return;
      }
      recentMessages.set(jid, { text: normalized, time: Date.now() });

      console.log(`📩 Pesan dari ${jid}: ${messageText}`);

      const quickReply = detectQuickReply(messageText);
      if (quickReply) {
        await sock.sendMessage(jid, { text: quickReply });

        if (['menu', 'help', 'bantuan'].includes(normalized)) {
          await sendMainMenu(sock, jid);
        }

        console.log(`✅ Quick reply terkirim ke ${jid}`);
        return;
      }

      if (['halo', 'hai', 'hi', 'p', 'permisi', 'assalamualaikum', 'assalamu\'alaikum'].includes(normalized)) {
        await sendMainMenu(sock, jid);
        console.log(`✅ Greeting menu terkirim ke ${jid}`);
        return;
      }

      const detectedTopic = detectTopic(messageText);
      if (detectedTopic) {
        const videos = await searchYoutubeVideosByTopic(detectedTopic, 5);
        const recommendationText = buildYoutubeRecommendationText(detectedTopic, videos);
        await sock.sendMessage(jid, { text: recommendationText });
        console.log(`✅ Rekomendasi YouTube terkirim ke ${jid} untuk topik: ${detectedTopic}`);
        return;
      }

      pushConversation(jid, 'user', messageText);
      const reply = await askAI(jid, messageText);
      pushConversation(jid, 'assistant', reply);

      await sock.sendMessage(jid, { text: reply });
      console.log(`✅ Reply AI terkirim ke ${jid}`);
    } catch (error) {
      console.error('❌ Gagal memproses pesan:', error);
      try {
        if (jid && activeSocket) {
          await activeSocket.sendMessage(jid, {
            text: `Maaf kak, sistem sedang gangguan. Silakan coba lagi atau hubungi admin di ${ADMIN_CONTACT} ya 🙏`
          });
        }
      } catch (sendError) {
        console.error('❌ Gagal kirim pesan fallback:', sendError?.message || sendError);
      }
    }
  });
}

const baseStyle = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Inter, Arial, sans-serif;
    background: radial-gradient(circle at top, #0f172a 0%, #020617 100%);
    color: #e5e7eb;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .container {
    width: 100%;
    max-width: 780px;
    background: rgba(17, 24, 39, 0.95);
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 24px;
    padding: 32px;
    box-shadow: 0 20px 60px rgba(0,0,0,.35);
    text-align: center;
    backdrop-filter: blur(14px);
  }
  h1 { margin-top: 0; margin-bottom: 8px; font-size: 30px; }
  p { line-height: 1.7; }
  .muted { color: #94a3b8; font-size: 14px; }
  .badge {
    display: inline-block;
    margin: 10px 0 18px;
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(30, 41, 59, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.2);
    font-size: 14px;
  }
  .ok { color: #86efac; }
  .warn { color: #fcd34d; }
  .qr {
    background: white;
    padding: 16px;
    border-radius: 18px;
    display: inline-block;
    margin: 14px 0;
  }
  img { max-width: 100%; height: auto; border-radius: 10px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    text-align: left;
    margin-top: 22px;
  }
  .card {
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 16px;
    padding: 14px;
  }
`;

app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    connected: isConnected,
    hasQr: !!qrCodeString,
    uptime: getUptime(),
    bot: BOT_NAME,
    aiEnabled: !!AI_ENDPOINT && !!AI_TOKEN,
    aiEndpoint: AI_ENDPOINT,
    youtubeConfigured: !!YOUTUBE_API_KEY && !!YOUTUBE_CHANNEL_ID,
    youtubeChannelUrl: YOUTUBE_CHANNEL_URL
  });
});

app.get('/youtube/test', async (req, res) => {
  try {
    const topic = String(req.query.topic || 'trauma').trim();
    const videos = await searchYoutubeVideosByTopic(topic, 5);

    return res.status(200).json({
      ok: true,
      topic,
      channelId: YOUTUBE_CHANNEL_ID || null,
      count: videos.length,
      videos
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get('/', (req, res) => {
  if (isConnected) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${BOT_NAME}</title>
        <style>${baseStyle}</style>
      </head>
      <body>
        <div class="container">
          <h1>${BOT_NAME}</h1>
          <div class="badge ok">Bot terhubung ke WhatsApp ✅</div>

          <p>
            Bot aktif dan siap membantu pengguna dalam menemukan
            media pembelajaran psikologi bersama
            <strong>Dr. Danang Baskoro, Psikolog</strong>.
          </p>

          <div class="grid">
            <div class="card">
              <strong>Status</strong><br/>
              Online & siap membantu pengguna
            </div>

            <div class="card">
              <strong>Uptime</strong><br/>
              ${getUptime()}
            </div>

            <div class="card">
              <strong>AI Endpoint</strong><br/>
              ${AI_ENDPOINT}
            </div>

            <div class="card">
              <strong>Admin</strong><br/>
              ${ADMIN_CONTACT}
            </div>

            <div class="card">
              <strong>YouTube API</strong><br/>
              ${YOUTUBE_API_KEY && YOUTUBE_CHANNEL_ID ? 'Aktif' : 'Belum diset'}
            </div>

            <div class="card">
              <strong>Channel YouTube</strong><br/>
              ${YOUTUBE_CHANNEL_URL}
            </div>
          </div>

          <div class="card" style="margin-top:16px; text-align:left;">
            <strong>Fitur Utama</strong><br/><br/>
            • Rekomendasi video psikologi berdasarkan topik<br/>
            • Akses channel YouTube Dr. Danang Baskoro<br/>
            • Panduan pembelajaran (trauma, healing, depresi, dll)<br/>
            • Fallback ke AI untuk pertanyaan umum
          </div>

          <p class="muted" style="margin-top:18px;">
            Catatan: Layanan ini bersifat edukatif dan tidak menggantikan
            konsultasi atau penanganan profesional secara langsung.
          </p>
        </div>
      </body>
      </html>
    `);
  }

  if (qrCodeString) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrCodeString)}`;
    return res.send(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${BOT_NAME}</title>
        <style>${baseStyle}</style>
        <meta http-equiv="refresh" content="15" />
      </head>
      <body>
        <div class="container">
          <h1>${BOT_NAME}</h1>
          <div class="badge warn">Scan QR WhatsApp</div>
          <p>Buka WhatsApp → <strong>Perangkat tertaut</strong> → <strong>Tautkan perangkat</strong>, lalu scan QR ini.</p>
          <div class="qr">
            <img src="${qrUrl}" alt="QR Code WhatsApp" />
          </div>
          <p class="muted">Halaman akan refresh otomatis. Jika QR berubah, silakan scan QR terbaru.</p>
        </div>
      </body>
      </html>
    `);
  }

  return res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${BOT_NAME}</title>
      <style>${baseStyle}</style>
      <meta http-equiv="refresh" content="3" />
    </head>
    <body>
      <div class="container">
        <h1>${BOT_NAME}</h1>

        <div class="badge">Menyiapkan sesi WhatsApp ⏳</div>

        <p>
          Bot sedang menyiapkan koneksi WhatsApp.
          Silakan tunggu beberapa detik sampai QR code muncul.
        </p>

        <p>
          Setelah terhubung, bot akan membantu pengguna menemukan
          media pembelajaran psikologi bersama
          <strong>Dr. Danang Baskoro, Psikolog</strong>.
        </p>

        <p class="muted">
          Mode AI aktif • Fokus pada edukasi psikologi dan rekomendasi materi pembelajaran
        </p>
      </div>
    </body>
    </html>
  `);
});

startBot().catch((err) => {
  console.error('❌ Gagal menjalankan bot:', err);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
