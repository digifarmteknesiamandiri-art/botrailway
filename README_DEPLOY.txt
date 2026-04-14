PanelSosial CS AI Bot

Environment variables:
AUTH_DIR=/app/auth
BOT_NAME=PanelSosial CS
BRAND_NAME=PanelSosial
ADMIN_CONTACT=wa.me/62xxxxxxxxxx

GEMINI_API_KEY=YOUR_NEW_KEY
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_TEXT_MODEL=gemini-3-flash-preview

Railway:
- Build Command: npm install
- Start Command: npm start
- Volume Mount Path: /app/auth

Catatan penting:
- Regenerate API key lama Anda karena tadi sempat terpapar.
- Bot ini memakai AI dengan guardrail sesuai ketentuan layanan.
- PanelSosial menyediakan jasa OTP / nomor virtual, bukan jual akun.
