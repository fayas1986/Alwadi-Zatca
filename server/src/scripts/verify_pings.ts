import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api/zatca/ping';

async function verifyPings() {
    const environments = ['sandbox', 'simulation', 'production'];
    
    console.log('--- Verifying ZATCA Portal Connectivity (Real-time) ---');
    
    for (const env of environments) {
        try {
            console.log(`Checking ${env.toUpperCase()}...`);
            const start = Date.now();
            const response = await axios.get(`${API_BASE_URL}/${env}`);
            const duration = Date.now() - start;
            
            if (response.data.success) {
                console.log(`✅ ${env.toUpperCase()} is ONLINE`);
                console.log(`   Host: ${response.data.host}`);
                console.log(`   Latency: ${response.data.latencyMs}ms (API reported)`);
                console.log(`   Status Code: ${response.data.statusCode}`);
                console.log(`   Total Request Time: ${duration}ms`);
            } else {
                console.log(`❌ ${env.toUpperCase()} report success: false`);
                console.log(`   Error: ${response.data.error}`);
            }
        } catch (error: any) {
            console.log(`❌ ${env.toUpperCase()} request FAILED`);
            console.log(`   Error Message: ${error.message}`);
            if (error.response) {
                console.log(`   Status: ${error.response.status}`);
                console.log(`   Data:`, error.response.data);
            }
        }
        console.log('----------------------------------------------------');
    }
}

verifyPings();
