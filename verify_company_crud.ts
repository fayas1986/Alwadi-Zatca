const BASE_URL = 'http://localhost:3001/api/admin';
const HEADERS = {
    'Content-Type': 'application/json',
    'x-user-role': 'SUPER_ADMIN'
};

async function verifyCompanyCRUD() {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const testVat = `30000000000${randomSuffix}3`;
    
    console.log('--- Phase 1: Create Company ---');
    const createRes = await fetch(`${BASE_URL}/companies`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
            name: `Verification Test ${randomSuffix}`,
            vatNumber: testVat,
            crNumber: '1010101010',
            branchName: 'Test Branch',
            address: 'Test Street',
            city: 'Riyadh',
            country: 'SA'
        })
    });

    const newOrg = await createRes.json();
    if (!createRes.ok) throw new Error(`Create failed: ${JSON.stringify(newOrg)}`);
    console.log('Created Org:', newOrg.id, newOrg.name);

    console.log('\n--- Phase 2: Update Company Name ---');
    const updateRes = await fetch(`${BASE_URL}/companies/${newOrg.id}`, {
        method: 'PUT',
        headers: HEADERS,
        body: JSON.stringify({
            name: 'Updated Verification Ltd',
            vatNumber: newOrg.vatNumber,
            crNumber: newOrg.crNumber,
            address: 'Updated Street',
            city: 'Jeddah',
            branchName: 'Updated Branch'
        })
    });

    const updateData = await updateRes.json();
    if (!updateRes.ok) throw new Error(`Update failed: ${JSON.stringify(updateData)}`);
    console.log('Update Result:', updateData.message);

    console.log('\n--- Phase 3: Verify Persistence ---');
    const fetchRes = await fetch(`${BASE_URL}/companies`, { headers: HEADERS });
    const allOrgs = await fetchRes.json();
    const found = allOrgs.find((o: any) => o.id === newOrg.id);

    if (found && found.name === 'Updated Verification Ltd') {
        console.log('✅ SUCCESS: Company name updated and persisted!');
    } else {
        console.log('❌ FAILURE: Company not found or name mismatch', found);
    }
}

verifyCompanyCRUD().catch(console.error);
