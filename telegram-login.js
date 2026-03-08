require('dotenv').config();
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');

// Support either TELEGRAM_API_ID/API_HASH or TELEGRAM_APP_ID/APP_HASH
const apiId = parseInt(process.env.TELEGRAM_API_ID || process.env.TELEGRAM_APP_ID);
const apiHash = process.env.TELEGRAM_API_HASH || process.env.TELEGRAM_APP_HASH;

if (!apiId || !apiHash) {
  console.error('Please set TELEGRAM_API_ID and TELEGRAM_API_HASH (or TELEGRAM_APP_ID/TELEGRAM_APP_HASH) in your .env');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function question(q, hide = false) {
  if (!hide) return new Promise((resolve) => rl.question(q, resolve));
  return new Promise((resolve) => {
    const stdin = process.openStdin();
    process.stdin.on('data', function charListener() { });
    rl.question(q, (answer) => resolve(answer));
  });
}

async function qrLogin(client, apiId, apiHash) {
  console.log('Starting QR login flow. A link will be printed — scan it from a logged-in Telegram app.');
  const apiCredentials = { apiId, apiHash };
  while (true) {
    try {
      const user = await client.signInUserWithQrCode(apiCredentials, {
        qrCode: async ({ token, expires }) => {
          // Debug: print server time and expiry absolute time to detect clock drift
          const nowMs = Date.now();
          const expiresMs = typeof expires === 'number' ? expires : 0;
          const expireAt = new Date(nowMs + expiresMs);
          console.log('\n[DEBUG] server time (UTC):', new Date(nowMs).toISOString());
          console.log('[DEBUG] token expires in (s):', Math.ceil(expiresMs / 1000));
          console.log('[DEBUG] token expiry at (UTC):', expireAt.toISOString());
            // token may be a Buffer/Uint8Array; provide both base64url and base64 representations
            let urlBase64url;
            try {
              urlBase64url = `tg://login?token=${token.toString('base64url')}`;
            } catch (e) {
              // fallback if base64url not supported
              urlBase64url = null;
            }
            const urlBase64 = `tg://login?token=${token.toString('base64')}`;

            console.log('\n--- QR Login ---');
            console.log(`Expires in ${Math.ceil(expires / 1000)} seconds`);

            // Try to render QR directly in the terminal for immediate scanning
            try {
              const qrcode = require('qrcode-terminal');
              const qrString = urlBase64url || urlBase64;
              console.log('Rendering QR code in terminal (scan this immediately)...');
              qrcode.generate(qrString, { small: true });
              console.log('\n(If scanning fails, open the link below in another device with Telegram)');
            } catch (err) {
              // qrcode-terminal not available — print links for quick external generation
              console.log('Quick links (scan one immediately):');
              if (urlBase64url) console.log(urlBase64url);
              console.log(urlBase64);
              console.log('\nTo render a QR in terminal install: npm i -g qrcode-terminal');
              console.log('Or open the link in a browser/QR generator and scan immediately.');
            }
          },
        password: async (hint) => {
          console.log('Account requires 2FA password (hint:', hint, ')');
          return await question('2FA password: ', true);
        },
        onError: (err) => {
          console.error('QR login error:', err);
          return false;
        },
      });

      console.log('Logged in as:', user ? user.username || user.id : user);
      const session = client.session.save();
      console.log('\nSUCCESS! Save this value to your .env as TELEGRAM_SESSION:');
      console.log(session);
      return true;
    } catch (err) {
      const code = err && (err.errorMessage || err.message || '');
      console.error('QR login failed:', code);
      if (String(code).includes('AUTH_TOKEN_EXPIRED')) {
        const retry = (await question('QR token expired before scanning. Generate a new QR? (y/N): ')).trim().toLowerCase();
        if (retry === 'y' || retry === 'yes') {
          continue; // loop and generate another token
        }
      }
      return false;
    }
  }
}

(async () => {
  try {
    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

    console.log('Connecting to Telegram...');
    await client.connect();
    console.log('Connected. Preparing to send code...');

    const phoneNumber = await question('Phone number (international format, e.g. +123456789): ');

    // Send code with verbose logging. If no delivery, retry with forceSMS=true.
    let sendResult;
    let lastSendError = null;
    try {
      sendResult = await client.sendCode({ apiId, apiHash }, phoneNumber, false);
      console.log('sendCode response:', sendResult);
    } catch (err) {
      lastSendError = err;
      console.error('sendCode failed (first attempt):', err && err.errorMessage ? err.errorMessage : err);
      try {
        console.log('Retrying sendCode with forceSMS=true...');
        sendResult = await client.sendCode({ apiId, apiHash }, phoneNumber, true);
        console.log('sendCode response (forceSMS):', sendResult);
      } catch (err2) {
        lastSendError = err2;
        console.error('sendCode failed (forceSMS attempt):', err2 && err2.errorMessage ? err2.errorMessage : err2);
        // continue — we'll offer QR login below
      }
    }

    let phoneCodeHash = sendResult?.phoneCodeHash;
    let isCodeViaApp = !!(sendResult && sendResult.isCodeViaApp);
    console.log('Code request sent. isCodeViaApp =', isCodeViaApp);
    if (isCodeViaApp) {
      console.log('Code may appear in your Telegram app (logged-in sessions).');
      const retry = (await question('No code received? Retry sending via SMS? (y/N): ')).trim().toLowerCase();
      if (retry === 'y' || retry === 'yes') {
        try {
          const forceResult = await client.sendCode({ apiId, apiHash }, phoneNumber, true);
          console.log('sendCode response (forceSMS):', forceResult);
          phoneCodeHash = forceResult?.phoneCodeHash || phoneCodeHash;
          isCodeViaApp = !!(forceResult && forceResult.isCodeViaApp);
          console.log('After forceSMS retry, isCodeViaApp =', isCodeViaApp);
          if (!isCodeViaApp) console.log('Code should arrive via SMS now.');
        } catch (err) {
          console.error('forceSMS sendCode failed:', err && err.errorMessage ? err.errorMessage : err);
        }
      }
      // If still no code or send was unavailable, offer QR login
      const offerQr = (await question('Still no code? Try QR login (scan from another Telegram session)? (y/N): ')).trim().toLowerCase();
      if (offerQr === 'y' || offerQr === 'yes') {
        const ok = await qrLogin(client, apiId, apiHash);
        if (ok) {
          await client.disconnect();
          rl.close();
          process.exit(0);
        }
      }
    } else {
      console.log('Code should arrive via SMS to the provided phone number.');
    }

    const phoneCode = await question('Enter the code you received: ');

    try {
      const result = await client.invoke(new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode }));
      if (result instanceof Api.auth.Authorization) {
        // Logged in
        const session = client.session.save();
        console.log('\nSUCCESS! Save this value to your .env as TELEGRAM_SESSION:');
        console.log(session);
      } else if (result instanceof Api.auth.AuthorizationSignUpRequired) {
        console.log('Sign up is required for this phone. Attempting sign up flow...');
        const firstName = await question('First name: ');
        const lastName = await question('Last name (optional): ');
        const signup = await client.invoke(new Api.auth.SignUp({ phoneNumber, phoneCodeHash, firstName, lastName }));
        console.log('Sign up result:', signup);
        const session = client.session.save();
        console.log('\nSUCCESS! Save this value to your .env as TELEGRAM_SESSION:');
        console.log(session);
      } else {
        console.log('Received unexpected response:', result);
      }
    } catch (err) {
      // Handle 2FA required
      if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        console.log('This account has 2FA enabled. Please enter your password.');
        const password = await question('2FA password: ', true);
        const user = await client.signInWithPassword({ apiId, apiHash }, { password: async () => password, onError: (e) => { console.error(e); return false; } });
        console.log('Signed in user:', user);
        const session = client.session.save();
        console.log('\nSUCCESS! Save this value to your .env as TELEGRAM_SESSION:');
        console.log(session);
      } else {
        throw err;
      }
    }

    await client.disconnect();
    rl.close();
    process.exit(0);
  } catch (err) {
    console.error('Failed to create Telegram session:', err);
    rl.close();
    process.exit(2);
  }
})();
