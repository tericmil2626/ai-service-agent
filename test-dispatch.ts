// Test script for Dispatch Agent
import { DispatchAgent } from './src/agents/DispatchAgent.js';
import { getDb, dbRun, dbGet, dbAll } from './src/database.js';

async function testDispatchAgent() {
  console.log('🧪 Testing Dispatch Agent\n');
  
  // Check existing technicians
  const techs = await dbAll('SELECT id, name, specialties FROM technicians WHERE is_active = 1');
  console.log(`Found ${techs.length} active technicians:`);
  techs.forEach((t: any) => {
    console.log(`  - ${t.name} (${JSON.parse(t.specialties || '[]').join(', ')})`);
  });
  console.log();

  // Create a test customer if needed
  let customer = await dbGet('SELECT id FROM customers WHERE phone = ?', ['+15559998888']);
  if (!customer) {
    const result = await dbRun(
      'INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)',
      ['Test Customer', '+15559998888', '123 Test Street, Springfield, IL']
    );
    customer = { id: result.lastID };
    console.log(`✅ Created test customer (ID: ${customer.id})`);
  } else {
    console.log(`ℹ️  Using existing test customer (ID: ${customer.id})`);
  }

  // Create a test job
  const jobResult = await dbRun(
    'INSERT INTO jobs (customer_id, service_type, description, urgency, status) VALUES (?, ?, ?, ?, ?)',
    [customer.id, 'hvac', 'AC not working, house is 90 degrees', 'high', 'scheduled']
  );
  const jobId = jobResult.lastID;
  console.log(`✅ Created test job (ID: ${jobId}) - HVAC emergency`);

  // Create a test appointment for tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];
  
  const apptResult = await dbRun(
    'INSERT INTO appointments (job_id, scheduled_date, scheduled_time, status) VALUES (?, ?, ?, ?)',
    [jobId, dateStr, '10:00', 'confirmed']
  );
  const appointmentId = apptResult.lastID;
  console.log(`✅ Created test appointment (ID: ${appointmentId}) for ${dateStr} at 10:00`);
  console.log();

  // Test the Dispatch Agent
  console.log('🚀 Testing Dispatch Agent...\n');
  
  const dispatchAgent = new DispatchAgent();
  await dispatchAgent.initialize({
    appointment_id: appointmentId,
    job_id: jobId,
    customer_id: customer.id,
    customer_name: 'Test Customer',
    customer_phone: '+15559998888',
    address: '123 Test Street, Springfield, IL',
    service_type: 'hvac',
    problem_description: 'AC not working, house is 90 degrees',
    urgency: 'high',
    scheduled_date: dateStr,
    scheduled_time: '10:00',
    status: 'pending_assignment',
  });

  const result = await dispatchAgent.assignTechnician();
  
  console.log('📊 Dispatch Result:');
  console.log('─'.repeat(50));
  console.log(`Assigned: ${result.assigned}`);
  console.log(`Response: ${result.response}`);
  if (result.technician) {
    console.log(`Technician: ${result.technician.name}`);
    console.log(`Phone: ${result.technician.phone}`);
    console.log(`Specialties: ${result.technician.specialties.join(', ')}`);
  }
  console.log('─'.repeat(50));
  console.log();

  // Verify in database
  const assigned = await dbGet(
    `SELECT a.*, t.name as tech_name, t.phone as tech_phone
     FROM appointments a
     LEFT JOIN technicians t ON a.technician_id = t.id
     WHERE a.id = ?`,
    [appointmentId]
  );
  
  console.log('🗄️  Database Verification:');
  console.log('─'.repeat(50));
  console.log(`Appointment ID: ${assigned.id}`);
  console.log(`Status: ${assigned.status}`);
  console.log(`Technician: ${assigned.tech_name || 'None'}`);
  console.log(`Technician ID: ${assigned.technician_id || 'None'}`);
  console.log('─'.repeat(50));
  console.log();

  // Cleanup
  console.log('🧹 Cleaning up test data...');
  await dbRun('DELETE FROM appointments WHERE id = ?', [appointmentId]);
  await dbRun('DELETE FROM jobs WHERE id = ?', [jobId]);
  console.log('✅ Test complete!\n');
}

// Run test
testDispatchAgent()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
