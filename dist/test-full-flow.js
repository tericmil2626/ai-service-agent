"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Full integration test including scheduling confirmation - WITH REAL LLM
const orchestrator_v2_1 = require("./orchestrator-v2");
// Force OpenAI provider
process.env.LLM_PROVIDER = 'openai';
process.env.LLM_MODEL = 'gpt-4o-mini';
const testConfig = {
    tier: 'professional',
    businessId: 'test-business',
    businessName: 'Test HVAC Services',
    businessConfig: {
        hours: { start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5, 6] },
        timezone: 'America/Chicago',
        services: ['plumbing', 'electrical', 'hvac', 'appliance']
    },
    features: {
        autoDispatch: true,
        reviewRequests: true,
        followUpReminders: true
    }
};
async function runTest() {
    console.log('🧪 Full Integration Test with Scheduling Confirmation\n');
    console.log(`Provider: ${process.env.LLM_PROVIDER}`);
    console.log(`Model: ${process.env.LLM_MODEL}\n`);
    const orchestrator = new orchestrator_v2_1.ServiceBusinessOrchestrator(testConfig);
    await orchestrator.initialize();
    console.log('✅ Orchestrator initialized\n');
    // Step 1: Initial contact
    console.log('📱 Step 1: New customer inquiry');
    const r1 = await orchestrator.processMessage({
        customerPhone: '+15551234567',
        message: "Hi, my AC is broken and it's 95 degrees in my house!",
        channel: 'sms',
        timestamp: new Date()
    });
    console.log(`   Customer: "Hi, my AC is broken..."`);
    console.log(`   Agent: "${r1.response}"`);
    console.log(`   Status: ${r1.handoffTo || 'continuing'}\n`);
    // Step 2: Provide name
    console.log('📱 Step 2: Customer provides name');
    const r2 = await orchestrator.processMessage({
        customerPhone: '+15551234567',
        message: 'My name is John Smith',
        channel: 'sms',
        timestamp: new Date()
    });
    console.log(`   Customer: "My name is John Smith"`);
    console.log(`   Agent: "${r2.response}"`);
    console.log(`   Status: ${r2.handoffTo || 'continuing'}\n`);
    // Step 3: Provide address
    console.log('📱 Step 3: Customer provides address');
    const r3 = await orchestrator.processMessage({
        customerPhone: '+15551234567',
        message: '123 Main Street, Springfield, IL',
        channel: 'sms',
        timestamp: new Date()
    });
    console.log(`   Customer: "123 Main Street, Springfield, IL"`);
    console.log(`   Agent: "${r3.response}"`);
    console.log(`   Status: ${r3.handoffTo || 'continuing'}\n`);
    // Step 4: Scheduling offers slots
    console.log('📱 Step 4: Scheduling agent offers slots');
    const r4 = await orchestrator.processMessage({
        customerPhone: '+15551234567',
        message: 'You can reach me at 555-123-4567',
        channel: 'sms',
        timestamp: new Date()
    });
    console.log(`   Customer: "You can reach me at 555-123-4567"`);
    console.log(`   Agent: "${r4.response}"`);
    console.log(`   Status: ${r4.handoffTo || 'continuing'}\n`);
    // Step 5: Customer confirms a slot
    console.log('📱 Step 5: Customer confirms a time slot');
    const r5 = await orchestrator.processMessage({
        customerPhone: '+15551234567',
        message: 'Yes, Friday at 8am works for me',
        channel: 'sms',
        timestamp: new Date()
    });
    console.log(`   Customer: "Yes, Friday at 8am works for me"`);
    console.log(`   Agent: "${r5.response}"`);
    console.log(`   Status: ${r5.handoffTo || 'continuing'}\n`);
    // Step 6: Check if dispatched
    if (r5.handoffTo?.includes('Dispatch')) {
        console.log('📱 Step 6: Dispatch agent assigns technician');
        const r6 = await orchestrator.processMessage({
            customerPhone: '+15551234567',
            message: 'Thanks!',
            channel: 'sms',
            timestamp: new Date()
        });
        console.log(`   Customer: "Thanks!"`);
        console.log(`   Agent: "${r6.response}"`);
        console.log(`   Status: ${r6.handoffTo || 'complete'}\n`);
    }
    console.log('✅ Full integration test completed!');
    console.log('\n🦞 End-to-end flow working with real LLM.');
}
runTest().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
//# sourceMappingURL=test-full-flow.js.map