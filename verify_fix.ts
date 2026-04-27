import { PrismaClient } from '@prisma/client';

// Mock function based on my changes in zatca.ts
const mapInvoiceToFrontendMock = (inv: any) => {
    return {
        id: inv.id,
        items: ((inv.metadata as any)?.items || (inv.metadata as any)?.originalPayload?.items || (inv.metadata as any)?.erp_raw?.items || []).map((it: any) => ({
            ...it,
            name: it.name || it.description || it.item_name || 'Item',
            total: Number(it.total ?? it.totalAmount ?? it.total_amount ?? it.amount ?? 0).toFixed(2),
        }))
    };
};

async function testFix() {
    console.log("--- Testing Fallback Logic ---");
    
    // Case 1: Old API V2 style (Items hidden in originalPayload)
    const mockInvV2 = {
        id: 1,
        metadata: {
            source: 'API_V2_FINAL',
            originalPayload: {
                items: [{ name: 'Test Item V2', total: 100 }]
            }
        }
    };
    
    // Case 2: New Standardized style
    const mockInvNew = {
        id: 2,
        metadata: {
            items: [{ name: 'Test Item New', total: 200 }],
            erp_raw: { items: [{ name: 'Test Item New', total: 200 }] }
        }
    };
    
    // Case 3: Empty (Null)
    const mockInvNull = {
        id: 3,
        metadata: null
    };

    const out1 = mapInvoiceToFrontendMock(mockInvV2);
    const out2 = mapInvoiceToFrontendMock(mockInvNew);
    const out3 = mapInvoiceToFrontendMock(mockInvNull);

    console.log("Result Case 1 (Fallback to originalPayload):", out1.items.length > 0 ? "SUCCESS" : "FAILED");
    console.log("Items 1:", JSON.stringify(out1.items));
    
    console.log("Result Case 2 (Direct metadata.items):", out2.items.length > 0 ? "SUCCESS" : "FAILED");
    console.log("Items 2:", JSON.stringify(out2.items));

    console.log("Result Case 3 (Null metadata):", out3.items.length === 0 ? "SUCCESS (As expected)" : "FAILED");
}

testFix();
