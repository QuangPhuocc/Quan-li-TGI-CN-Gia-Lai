import { Client } from 'ssh2';

const conn = new Client();

const script = `
echo "=== 1. Navigating to project ==="
cd /root/Quan-li-TGI-CN-Gia-Lai || exit 1

echo "=== 2. Pulling changes from Git ==="
git fetch origin main || exit 1
git reset --hard origin/main || exit 1

echo "=== 3. Installing dependencies ==="
npm install || exit 1

echo "=== 4. Rebuilding frontend ==="
npm run build || exit 1

echo "=== 5. Restarting tgi-insurance PM2 ==="
pm2 restart tgi-insurance || exit 1

echo "=== VPS DEPLOYMENT COMPLETED ==="
`;

conn.on('ready', () => {
  console.log('SSH connection successful! Running update on VPS...');
  conn.exec(script, (err, stream) => {
    if (err) {
      console.error('Execution error:', err);
      process.exit(1);
    }
    stream.on('close', (code, signal) => {
      console.log('\nExecution finished with code: ' + code);
      conn.end();
      process.exit(code);
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error('Connection failed:', err);
  process.exit(1);
}).connect({
  host: '103.211.200.219',
  port: 22,
  username: 'root',
  password: 'Ku7Vrtq1ephRUXUx'
});
