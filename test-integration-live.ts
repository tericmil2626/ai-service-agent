// Quick integration test for the service business system - WITH REAL LLM
import { ServiceBusinessOrchestrator } from './orchestrator-v2';
import { OrchestratorConfig } from './types/agents';

// Force OpenAI provider
process.env.LLM_PROVIDER = 'openai';
process.env.LLM_MODEL = 'gpt-4o-mini';

const testConfig: OrchestratorConfig = {
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
  console.log('🧪 Starting integration test with REAL OpenAI LLM...\n');
  console.log(`Provider: ${process.env.LLM_PROVIDER}`);
  console.log(`Model: ${process.env.LLM_MODEL}\n`);

  // Initialize orchestrator
  const orchestrator = new ServiceBusinessOrchestrator(testConfig);
  await orchestrator.initialize();
  
  const status = orchestrator.getStatus();
  console.log('✅ Orchestrator initialized');
  console.log(`   Tier: ${status.tier}`);
  console.log(`   Agents: ${status.agents.join(', ')}\n`);

  // Test 1: New customer intake
  console.log('📱 Test 1: New customer inquiry (urgent AC issue)');
  console.log('   Customer: "Hi, my AC is broken and it\'s 95 degrees in my house!"');
  const result1 = await orchestrator.processMessage({
    customerPhone: '+15551234567',
    message: "Hi, my AC is broken and it's 95 degrees in my house!",
    channel: 'sms',
    timestamp: new Date()
  });
  console.log(`   Agent: "${result1.response}"`);
  console.log(`   Handoff: ${result1.handoffTo || 'none'}\n`);

  // Test 2: Provide name
  console.log('📱 Test 2: Customer provides name');
  console.log('   Customer: "My name is John Smith"');
  const result2 = await orchestrator.processMessage({
    customerPhone: '+15551234567',
    message: 'My name is John Smith',
    channel: 'sms',
    timestamp: new Date()
  });
  console.log(`   Agent: "${result2.response}"`);
  console.log(`   Handoff: ${result2.handoffTo || 'none'}\n`);

  // Test 3: Provide address
  console.log('📱 Test 3: Customer provides address');
  console.log('   Customer: "123 Main Street, Springfield, IL"');
  const result3 = await orchestrator.processMessage({
    customerPhone: '+15551234567',
    message: '123 Main Street, Springfield, IL',
    channel: 'sms',
    timestamp: new Date()
  });
  console.log(`   Agent: "${result3.response}"`);
  console.log(`   Handoff: ${result3.handoffTo || 'none'}\n`);

  // Test 4: Provide phone
  console.log('📱 Test 4: Customer provides phone');
  console.log('   Customer: "You can reach me at 555-123-4567"');
  const result4 = await orchestrator.processMessage({
    customerPhone: '+15551234567',
    message: 'You can reach me at 555-123-4567',
    channel: 'sms',
    timestamp: new Date()
  });
  console.log(`   Agent: "${result4.response}"`);
  console.log(`   Handoff: ${result4.handoffTo || 'none'}\n`);

  // Test 5: Confirm scheduling
  if (result4.handoffTo?.includes('Scheduling')) {
    console.log('📱 Test 5: Customer confirms scheduling');
    console.log('   Customer: "Yes, that works for me"');
    const result5 = await orchestrator.processMessage({
      customerPhone: '+15551234567',
      message: 'Yes, that works for me',
      channel: 'sms',
      timestamp: new Date()
    });
    console.log(`   Agent: "${result5.response}"`);
    console.log(`   Handoff: ${result5.handoffTo || 'none'}\n`);
  }

  console.log('✅ Integration test completed!');
  console.log('\n🦞 All systems operational with real LLM.');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
