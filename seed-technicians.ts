// Seed script for mock technicians
import { createTechnician, getAllTechnicians } from './src/agents/DispatchAgent.js';
import { getDb } from './src/database.js';

async function seedTechnicians() {
  console.log('🛠️  Seeding mock technicians...\n');

  // Check existing technicians
  const existing = await getAllTechnicians();
  if (existing.length > 0) {
    console.log(`Found ${existing.length} existing technicians:`);
    existing.forEach(t => {
      console.log(`  - ${t.name} (${t.specialties.join(', ')})`);
    });
    console.log('\nSkipping seed (technicians already exist).');
    console.log('To reseed, delete the technicians table first.\n');
    return;
  }

  const technicians = [
    {
      name: 'Mike Rodriguez',
      phone: '+1-555-0101',
      email: 'mike.rodriguez@example.com',
      specialties: ['hvac', 'heating', 'air conditioning', 'furnace'],
    },
    {
      name: 'Sarah Chen',
      phone: '+1-555-0102',
      email: 'sarah.chen@example.com',
      specialties: ['electrical', 'wiring', 'lighting', 'panel upgrades'],
    },
    {
      name: 'James "Jimmy" O\'Brien',
      phone: '+1-555-0103',
      email: 'jimmy.obrien@example.com',
      specialties: ['plumbing', 'drains', 'leaks', 'water heaters', 'pipes'],
    },
    {
      name: 'Lisa Thompson',
      phone: '+1-555-0104',
      email: 'lisa.thompson@example.com',
      specialties: ['hvac', 'plumbing', 'general maintenance'],
    },
    {
      name: 'David Kim',
      phone: '+1-555-0105',
      email: 'david.kim@example.com',
      specialties: ['electrical', 'hvac', 'smart home', 'automation'],
    },
    {
      name: 'Marcus Johnson',
      phone: '+1-555-0106',
      email: 'marcus.johnson@example.com',
      specialties: ['appliance', 'washer', 'dryer', 'dishwasher', 'refrigerator'],
    },
  ];

  console.log('Creating technicians:\n');
  
  for (const tech of technicians) {
    try {
      const id = await createTechnician(tech);
      console.log(`  ✅ ${tech.name} (ID: ${id})`);
      console.log(`     Specialties: ${tech.specialties.join(', ')}`);
      console.log(`     Phone: ${tech.phone}\n`);
    } catch (error) {
      console.error(`  ❌ Failed to create ${tech.name}:`, error);
    }
  }

  console.log(`✅ Seeded ${technicians.length} technicians successfully!\n`);
  
  // Verify
  const allTechs = await getAllTechnicians();
  console.log('Current technician roster:');
  console.log('─'.repeat(60));
  allTechs.forEach(t => {
    console.log(`${t.name.padEnd(20)} | ${t.specialties.join(', ').padEnd(30)} | ${t.phone}`);
  });
  console.log('─'.repeat(60));
}

// Run if executed directly
// Check if this file is being run directly (ESM compatible)
const isMainModule = process.argv[1]?.includes('seed-technicians');
if (isMainModule) {
  seedTechnicians()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

export { seedTechnicians };
