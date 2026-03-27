// Quick test of the tiered orchestrator
import { ServiceBusinessOrchestrator } from './orchestrator-v2';

async function testTier(tier: string) {
  console.log(`\n=== Testing ${tier.toUpperCase()} Tier ===\n`);
  
  const config = {
    tier,
    businessId: 'test',
    businessName: 'Test Business',
    businessConfig: {
      hours: { start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5, 6] },
      timezone: 'America/Chicago',
      services: ['plumbing', 'hvac'],
    },
    features: {
      autoDispatch: tier !== 'starter',
      reviewRequests: tier !== 'starter',
      followUpReminders: tier !== 'starter',
    },
  };

  const orchestrator = new ServiceBusinessOrchestrator(config);
  await orchestrator.initialize();
  
  const status = orchestrator.getStatus();
  console.log(`Agents: ${status.agents.join(', ')}`);
  console.log(`Features: ${status.features.join(', ')}`);
  
  return status;
}

async function main() {
  console.log('Service Business Orchestrator - Tier Test');
  
  await testTier('starter');
  await testTier('growth');
  await testTier('professional');
  await testTier('enterprise');
  
  console.log('\n=== All tiers tested successfully ===');
}

main().catch(console.error);
