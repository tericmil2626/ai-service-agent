import { IntakeAgent } from './dist/agents/IntakeAgent.js';
import { SchedulingAgent } from './dist/agents/SchedulingAgent.js';
import { getSMSProvider } from './dist/sms.js';

const sms = getSMSProvider();

async function testIntakeAgent() {
  console.log('🧪 Testing LLM-Powered Intake Agent (Kimi K2.5)\n');
  console.log('=' .repeat(60));

  const agent = new IntakeAgent('test');
  const phone = '+15551234567';

  // Test conversation simulating a customer with an AC problem
  const messages = [
    "Hi, my AC is broken and it's 95 degrees in my house!",
    "This is John Smith",
    "123 Main Street, Springfield, IL",
    "It's blowing hot air and making a weird grinding noise",
    "ASAP please, it's unbearable!",
  ];

  console.log('📱 Simulating SMS conversation...\n');

  for (const message of messages) {
    console.log(`👤 Customer: ${message}`);
    
    const result = await agent.handleMessage(message, phone);
    
    console.log(`🤖 Agent: ${result.response}`);
    console.log(`   ✅ Complete: ${result.isComplete}`);
    console.log(`   📋 Handoff: ${result.handoffTo || 'none'}`);
    
    if (result.data) {
      console.log(`   📊 Data: ${JSON.stringify(result.data, null, 2)}`);
    }
    
    console.log('');

    if (result.isComplete && result.handoffTo?.includes('Scheduling')) {
      console.log('=' .repeat(60));
      console.log('✅ Intake complete! Testing scheduling...\n');
      await testSchedulingAgent(result.data, phone);
      break;
    }
  }
}

async function testSchedulingAgent(customerData: any, phone: string) {
  const schedulingAgent = new SchedulingAgent();

  console.log('📅 Scheduling Agent receiving handoff...');
  const result = await schedulingAgent.receiveFromReceptionist(customerData);
  
  console.log(`🤖 Scheduling Agent: ${result.response}\n`);

  if (result.slots && result.slots.length > 0) {
    console.log('📋 Available slots:');
    result.slots.forEach((slot, i) => {
      const date = new Date(slot.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      console.log(`   ${i + 1}. ${dayName} at ${slot.time}`);
    });

    // Test selecting first slot
    console.log('\n👤 Customer: "The first one works for me"');
    const confirmResult = await schedulingAgent.handleTimeSelection('option 1');
    
    console.log(`🤖 Scheduling Agent: ${confirmResult.response}`);
    console.log(`   ✅ Confirmed: ${confirmResult.confirmed}`);
    
    if (confirmResult.appointment) {
      console.log(`   📅 Appointment ID: ${confirmResult.appointment.id}`);
      console.log(`   📍 ${confirmResult.appointment.date} at ${confirmResult.appointment.time}`);
      
      // Simulate sending SMS confirmation
      console.log('\n📱 Sending SMS confirmation...');
      await sms.sendSMS(phone, confirmResult.response);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Test complete!');
}

// Run test
testIntakeAgent().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
