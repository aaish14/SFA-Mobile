// Called only by the private setup window. Read credentials from stdin, never CLI arguments.
const nodemailer = require('../sales-rep-mobile/backend/node_modules/nodemailer');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; if (input.length > 2048) process.exit(1); });
process.stdin.on('end', async () => {
  let client;
  try {
    const { user, password } = JSON.parse(input); input = '';
    if (!/^[a-z0-9._%+-]+@(?:gmail|googlemail)\.com$/i.test(user) || !/^[a-z]{16}$/i.test(password))
      throw Object.assign(new Error(), { code: 'INVALID_SETTINGS' });
    client = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass: password },
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      logger: false, debug: false,
    });
    await client.verify();
    process.stdout.write(JSON.stringify({ verified: true }));
  } catch (error) {
    const category = ['EAUTH', 'INVALID_SETTINGS'].includes(error.code) ? error.code : 'CONNECTION_FAILED';
    process.stdout.write(JSON.stringify({ verified: false, category }));
    process.exitCode = 1;
  } finally { client?.close(); }
});
