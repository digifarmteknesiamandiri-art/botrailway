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

const express = require('express');
const axios = require('axios');
const QRCode = require('qrcode'); // Untuk generate gambar QR
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 3000;

const AUTH_DIR = process.env.AUTH_DIR || './auth';
const ADMIN_CONTACT = process.env.ADMIN_CONTACT || '-';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let qrCodeBase64 = null; // Simpan QR di sini
let isConnected = false;

// 🤖 FUNGSI PANGGIL GEMINI
async function askAI(text) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          role: "user",
          parts: [{ text: `System: Kamu CS PanelSosial profesional. Jual OTP, bukan akun. Admin: ${ADMIN_CONTACT}\nUser: ${text}` }]
        }]
      }
    );
    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || 'Maaf kak, lagi sibuk nih. Coba lagi ya.';
  } catch (err) {
    return 'Maaf kak, koneksi AI terganggu. Hubungi admin ya.';
  }
}

// 🚀 START BOT
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Ubah string QR jadi gambar Base64 agar bisa tampil di browser
      qrCodeBase64 = await QRCode.toDataURL(qr);
      console.log('--- QR Code diperbarui, cek di browser! ---');
    }

    if (connection === 'open') {
      isConnected = true;
      qrCodeBase64 = null; // Hapus QR setelah login
      console.log('✅ Bot Terhubung!');
    }

    if (connection === 'close') {
      isConnected = false;
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;

    const jid = m.key.remoteJid;
    const text = m.message.conversation || m.message.extendedTextMessage?.text;
    if (!text) return;

    await sock.sendPresenceUpdate('composing', jid);
    const reply = await askAI(text);
    await sock.sendMessage(jid, { text: reply });
  });
}

// 🌐 Tampilan Public Railway
app.get('/', (req, res) => {
  if (isConnected) {
    res.send(`
      <body style="font-family:sans-serif; text-align:center; padding:50px;">
        <h1 style="color:green;">✅ Bot Aktif!</h1>
        <p>Bot PanelSosial sudah terhubung ke WhatsApp.</p>
      </body>
    `);
  } else if (qrCodeBase64) {
    res.send(`
      <body style="font-family:sans-serif; text-align:center; padding:50px;">
        <h1>Scan QR Code</h1>
        <p>Silakan scan untuk menyambungkan bot ke WhatsApp:</p>
        <img src="${qrCodeBase64}" style="border: 10px solid #f0f0f0; border-radius:10px;" />
        <p><i>QR akan otomatis berganti jika expired, silakan refresh halaman berkala.</i></p>
      </body>
    `);
  } else {
    res.send('<h1>Sedang memuat QR...</h1><p>Tunggu sebentar atau coba refresh.</p>');
  }
});

startBot();
app.listen(PORT, () => console.log(`Server aktif di port ${PORT}`));
