"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Quick integration test for the service business system
const orchestrator_v2_1 = require("./orchestrator-v2");
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
    console.log('🧪 Starting integration test...\n');
    // Initialize orchestrator
    const orchestrator = new orchestrator_v2_1.ServiceBusinessOrchestrator(testConfig);
    await orchestrator.initialize();
    const status = orchestrator.getStatus();
    console.log('✅ Orchestrator initialized');
    console.log(`   Tier: ${status.tier}`);
    console.log(`   Agents: ${status.agents.join(', ')}`);
    console.log(`   Features: ${status.features.join(', ')}\n`);
    // Test 1: New customer intake
    console.log('📱 Test 1: New customer inquiry');
    const result1 = await orchestrator.processMessage({
        customerPhone: '+15551234567',
        message: 'Hi, my AC is broken and it\'s 95 degrees in my house!',
        channel: 'sms',
        timestamp: new Date()
    });
    console.log(`   Customer: "Hi, my AC is broken..."`);
    console.log(`   Agent: "${result1.response.substring(0, 100)}..."`);
    console.log(`   Handoff: ${result1.handoffTo || 'none'}\n`);
    // Test 2: Provide name
    console.log('📱 Test 2: Customer provides name');
    const result2 = await orchestrator.processMessage({
        customerPhone: '+15551234567',
        message: 'My name is John Smith',
        channel: 'sms',
        timestamp: new Date()
    });
    console.log(`   Customer: "My name is John Smith"`);
    console.log(`   Agent: "${result2.response.substring(0, 100)}..."`);
    console.log(`   Handoff: ${result2.handoffTo || 'none'}\n`);
    // Test 3: Provide address
    console.log('📱 Test 3: Customer provides address');
    const result3 = await orchestrator.processMessage({
        customerPhone: '+15551234567',
        message: '123 Main Street, Springfield, IL',
        channel: 'sms',
        timestamp: new Date()
    });
    console.log(`   Customer: "123 Main Street, Springfield, IL"`);
    console.log(`   Agent: "${result3.response.substring(0, 100)}..."`);
    console.log(`   Handoff: ${result3.handoffTo || 'none'}\n`);
    console.log('✅ Integration test completed successfully!');
    console.log('\n🦞 All systems operational.');
}
runTest().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
//# sourceMappingURL=test-integration.js.map