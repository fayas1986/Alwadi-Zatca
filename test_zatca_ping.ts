import axios from 'axios';

async function pingServers() {
    const envs = ['sandbox', 'simulation', 'production'];
    for (const env of envs) {
        try {
            const start = Date.now();
            const response = await axios.get(`http://localhost:3001/api/zatca/ping/${env}`);
            console.log(`[${env.toUpperCase()}] Reachable: ${response.data.online} (${response.data.latencyMs}ms) -> ${response.data.host}`);
        } catch (e: any) {
            console.error(`[${env.toUpperCase()}] Ping failed: ${e.message}`);
        }
    }
}

pingServers();
